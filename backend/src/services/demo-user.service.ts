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

export interface DemoUserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
}

function defaultProfile(): DemoUserProfile {
  return {
    id: SYNC_USER_ID,
    email: "demo@mindtasker.local",
    phone: null,
    phone_verified: false,
    phone_pending: null,
  };
}

function readProfile(): DemoUserProfile {
  if (!existsSync(profilePath)) {
    return defaultProfile();
  }

  try {
    const raw = readFileSync(profilePath, "utf8");
    return { ...defaultProfile(), ...(JSON.parse(raw) as Partial<DemoUserProfile>) };
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
