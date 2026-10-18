import {
  SUPABASE_PROJECT_REF,
} from "./management-token.ts";

const GITHUB_REPO = "erezbabayan/BabiTk";
const GITHUB_BRANCH = "main";
const FUNCTIONS_ROOT = "supabase/functions";

const VERIFY_JWT: Record<string, boolean> = {
  "whatsapp-green-webhook": false,
  "github-oidc-mint": false,
  "whatsapp-send-reminders": false,
  "google-calendar": false,
  "google-login": false,
  "whatsapp-green-connect": true,
  "transcribe-voice-item": true,
  "ingest-voice": true,
  "ingest-notebook": true,
};

export const OWNER_REPAIR_SLUGS = [
  "github-oidc-mint",
  "whatsapp-green-webhook",
  "whatsapp-green-connect",
] as const;

type GithubContentItem = {
  type?: unknown;
  path?: unknown;
  download_url?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

async function githubFetch(url: string): Promise<Response> {
  return await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "babitk-token-repair",
    },
  });
}

async function listGithubFiles(dirPath: string): Promise<string[]> {
  const url =
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${dirPath}?ref=${GITHUB_BRANCH}`;
  const response = await githubFetch(url);
  if (!response.ok) {
    throw new Error(`github_list_${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("github_list_shape");
  }
  const files: string[] = [];
  for (const item of payload) {
    if (!isRecord(item)) continue;
    const typed = item as GithubContentItem;
    const path = typeof typed.path === "string" ? typed.path : "";
    const type = typeof typed.type === "string" ? typed.type : "";
    if (!path) continue;
    if (type === "file") files.push(path);
    else if (type === "dir") files.push(...(await listGithubFiles(path)));
  }
  return files;
}

async function readGithubFile(path: string): Promise<string> {
  const url =
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
  const response = await githubFetch(url);
  if (!response.ok) {
    throw new Error(`github_file_${response.status}`);
  }
  return await response.text();
}

export async function setProjectSecrets(
  token: string,
  secrets: Array<{ name: string; value: string }>,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/secrets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(secrets),
    },
  );
  const detail = (await response.text()).slice(0, 400);
  return { ok: response.ok, status: response.status, detail };
}

export async function deployEdgeFunctionFromGithub(
  token: string,
  slug: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const paths = [
    `${FUNCTIONS_ROOT}/deno.json`,
    `${FUNCTIONS_ROOT}/${slug}/index.ts`,
    ...(await listGithubFiles(`${FUNCTIONS_ROOT}/_shared`)),
  ];
  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      name: slug,
      entrypoint_path: `${slug}/index.ts`,
      import_map_path: "deno.json",
      verify_jwt: VERIFY_JWT[slug] ?? true,
    }),
  );
  let fileCount = 0;
  for (const fullPath of paths) {
    if (!fullPath.startsWith(`${FUNCTIONS_ROOT}/`)) continue;
    const relative = fullPath.slice(FUNCTIONS_ROOT.length + 1);
    const content = await readGithubFile(fullPath);
    form.append("file", new Blob([content], { type: "text/plain" }), relative);
    fileCount += 1;
  }
  if (fileCount < 2) {
    return { ok: false, status: 500, detail: "missing_function_sources" };
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
      },
      body: form,
    },
  );
  const detail = (await response.text()).slice(0, 400);
  return { ok: response.ok, status: response.status, detail };
}

export async function repairDeploySecretsAndFunctions(
  token: string,
): Promise<{ secrets: boolean; deployed: string[]; failed: string[] }> {
  const secrets = await setProjectSecrets(token, [
    { name: "GITHUB_OIDC_DEPLOY_TOKEN", value: token },
    { name: "BABITK_MANAGEMENT_TOKEN", value: token },
  ]);
  const deployed: string[] = [];
  const failed: string[] = [];
  for (const slug of OWNER_REPAIR_SLUGS) {
    const result = await deployEdgeFunctionFromGithub(token, slug);
    if (result.ok) deployed.push(slug);
    else failed.push(`${slug}:${result.status}`);
  }
  return { secrets: secrets.ok, deployed, failed };
}
