import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { inboundHebrewProofreadPrompt } from "../../../convex/lib/ingest/notebookOcr.ts";
import {
  GEMINI_ATTEMPTS_PER_MODEL,
  GEMINI_VISION_MODELS,
  GROQ_PARSE_MODELS,
  GROQ_VISION_MODEL_DEFAULT,
  geminiVisionModelOrder,
  normalizeProofreadPunctuation,
  refineNotebookTranscription,
  transcribeCaptureImage,
} from "../../../supabase/functions/_shared/notebook-ocr.ts";

type Call = { url: string; body: Record<string, any> };

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_VISION_MODEL",
  "GROQ_VISION_MODEL",
  "GEMINI_PARSE_MODEL",
  "GROQ_PARSE_MODEL",
];

function jpeg(): Uint8Array {
  const bytes = new Uint8Array(120);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.fill(7, 4);
  return bytes;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const geminiOk = (text: string) => json(200, { candidates: [{ content: { parts: [{ text }] } }] });
const groqOk = (text: string) => json(200, { choices: [{ message: { content: text } }] });

let calls: Call[] = [];
let savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

function mockFetch(handler: (call: Call, index: number) => Response) {
  globalThis.fetch = (async (input: string | URL | Request | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("notebook OCR chain (trimmed)", () => {
  it("uses exactly two free Gemini models and the current Groq vision model", () => {
    assert.deepEqual([...GEMINI_VISION_MODELS], ["gemini-3.5-flash-lite", "gemini-3.6-flash"]);
    assert.equal(GEMINI_ATTEMPTS_PER_MODEL, 2);
    assert.equal(GROQ_VISION_MODEL_DEFAULT, "qwen/qwen3.8-27b");
    assert.deepEqual([...GROQ_PARSE_MODELS], ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    assert.deepEqual(geminiVisionModelOrder("gemini-x"), ["gemini-x", "gemini-3.5-flash-lite"]);
    assert.deepEqual(geminiVisionModelOrder(""), [...GEMINI_VISION_MODELS]);
  });

  it("sends the image before the text at temperature 0, retrying a transient error once", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch((_call, index) => (index < 2 ? json(503, { error: { message: "overloaded" } }) : geminiOk("קנה חלב")));
    const result = await transcribeCaptureImage(jpeg(), "image/jpeg");
    assert.equal(result.engine, "gemini");
    assert.equal(result.rawTranscription, "קנה חלב");
    assert.equal(calls.length, 3);
    assert.match(calls[0]!.url, /models\/gemini-3\.5-flash-lite:generateContent/);
    assert.match(calls[1]!.url, /models\/gemini-3\.5-flash-lite:generateContent/);
    assert.match(calls[2]!.url, /models\/gemini-3\.6-flash:generateContent/);
    const parts = calls[0]!.body.contents[0].parts;
    assert.ok(parts[0].inlineData, "image part first");
    assert.equal(typeof parts[1].text, "string");
    assert.equal(calls[0]!.body.generationConfig.temperature, 0);
    assert.equal(calls[0]!.body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    assert.equal(calls[2]!.body.generationConfig.thinkingConfig.thinkingLevel, "low");
  });

  it("falls back to Groq qwen vision (image first, reasoning off) and never calls OpenAI", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch((call) =>
      call.url.includes("generativelanguage")
        ? json(404, { error: { message: "model not found" } })
        : groqOk("שורה 1"),
    );
    const result = await transcribeCaptureImage(jpeg(), "image/jpeg");
    assert.equal(result.engine, "groq");
    // 404 is not transient: one call per Gemini model, then Groq.
    assert.equal(calls.length, 3);
    const groq = calls[2]!;
    assert.match(groq.url, /api\.groq\.com/);
    assert.equal(groq.body.model, "qwen/qwen3.8-27b");
    assert.equal(groq.body.reasoning_effort, "none");
    assert.equal(groq.body.temperature, 0);
    const content = groq.body.messages[0].content;
    assert.equal(content[0].type, "image_url");
    assert.equal(content[1].type, "text");
    assert.ok(calls.every((call) => !call.url.includes("openai.com")));
  });

  it("does not offer OpenAI-only setups as configured vision", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch(() => groqOk("x"));
    await assert.rejects(() => transcribeCaptureImage(jpeg(), "image/jpeg"), /vision_ocr_not_configured/);
    assert.equal(calls.length, 0);
  });

  it("proofreads via Groq qwen then gpt-oss-120b, never OpenAI", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch((call) =>
      call.body.model === "qwen/qwen3.8-27b"
        ? json(429, { error: { message: "rate limit" } })
        : groqOk("פגישה ב‑9:45 ב-12.11 עם Acme"),
    );
    const refined = await refineNotebookTranscription("פגישה ב-9:45 ב-12.11 עם Acme");
    assert.equal(refined, "פגישה ב-9:45 ב-12.11 עם Acme");
    assert.deepEqual(
      calls.map((call) => call.body.model),
      ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"],
    );
    assert.equal(calls[1]!.body.reasoning_effort, "low");
    assert.equal(calls[1]!.body.include_reasoning, false);
    assert.ok(calls.every((call) => !call.url.includes("openai.com")));
  });

  it("proofread prompt forbids changing numbers, dates and English words", () => {
    assert.match(inboundHebrewProofreadPrompt, /אל תשנה מספרים, תאריכים, שעות/);
    assert.match(inboundHebrewProofreadPrompt, /אל תשנה, תתרגם או תתעתק מילים באנגלית/);
    assert.equal(normalizeProofreadPunctuation("ל\u2011Zoom"), "ל-Zoom");
  });
});
