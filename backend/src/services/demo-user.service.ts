import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SYNC_USER_ID } from "./sync-store.service.js";
import { normalizePhone } from "./items.service.js";

const dataDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../data",
);
const profilePath = path.join(dataDir, "demo-user.json");

export interface DemoOtpState {
  pending: string | null;
  hash: string | null;
  expiresAt: string | null;
  attempts: number;
  sentAt: string[];
}

export interface DemoUserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
  phone_verify_hash: string | null;
  phone_verify_expires_at: string | null;
  phone_verify_attempts: number;
  phone_verify_sent_at: string[];
}

function defaultProfile(): DemoUserProfile {
  return {
    id: SYNC_USER_ID,
    email: "demo@mindtasker.local",
    phone: null,
    phone_verified: false,
    phone_pending: null,
    phone_verify_hash: null,
    phone_verify_expires_at: null,
    phone_verify_attempts: 0,
    phone_verify_sent_at: [],
  };
}

function readProfile(): DemoUserProfile {
  if (!existsSync(profilePath)) {
    return defaultProfile();
  }

  try {
    const raw = readFileSync(profilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DemoUserProfile>;
    return {
      ...defaultProfile(),
      ...parsed,
      phone_verify_attempts: parsed.phone_verify_attempts ?? 0,
      phone_verify_sent_at: Array.isArray(parsed.phone_verify_sent_at)
        ? parsed.phone_verify_sent_at
        : [],
    };
  } catch {
    return defaultProfile();
  }
}

function writeProfile(profile: DemoUserProfile): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

export async function getDemoUserProfile(): Promise<DemoUserProfile> {
  return readProfile();
}

export async function linkDemoUserPhone(rawPhone: string): Promise<DemoUserProfile> {
  const phone = normalizePhone(rawPhone);
  const profile: DemoUserProfile = {
    ...readProfile(),
    phone,
    phone_verified: true,
    phone_pending: null,
    phone_verify_hash: null,
    phone_verify_expires_at: null,
    phone_verify_attempts: 0,
  };
  writeProfile(profile);
  return profile;
}

export async function setDemoUserPhonePending(rawPhone: string): Promise<DemoUserProfile> {
  const profile: DemoUserProfile = {
    ...readProfile(),
    phone_pending: normalizePhone(rawPhone),
  };
  writeProfile(profile);
  return profile;
}

export async function readDemoOtpState(): Promise<DemoOtpState> {
  const profile = readProfile();
  return {
    pending: profile.phone_pending,
    hash: profile.phone_verify_hash,
    expiresAt: profile.phone_verify_expires_at,
    attempts: profile.phone_verify_attempts ?? 0,
    sentAt: profile.phone_verify_sent_at ?? [],
  };
}

export async function writeDemoOtpState(state: DemoOtpState): Promise<void> {
  const profile = readProfile();
  writeProfile({
    ...profile,
    phone_pending: state.pending,
    phone_verify_hash: state.hash,
    phone_verify_expires_at: state.expiresAt,
    phone_verify_attempts: state.attempts,
    phone_verify_sent_at: state.sentAt,
  });
}
