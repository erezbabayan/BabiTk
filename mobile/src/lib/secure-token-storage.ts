import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { CHUNK_MARKER, parseChunkMarker, secureKey, splitIntoChunks } from "./secure-chunks";

/**
 * Auth-token storage backed by expo-secure-store (Android Keystore / iOS Keychain).
 * - SecureStore values are limited (~2KB), so long values are split into chunks.
 * - One-time migration: a value still in AsyncStorage is copied into SecureStore
 *   and the AsyncStorage copy is deleted, so existing sessions stay logged in.
 * - If SecureStore is unavailable on a device, falls back to AsyncStorage so login never breaks.
 */
async function secureRead(key: string): Promise<string | null> {
  const k = secureKey(key);
  const head = await SecureStore.getItemAsync(k);
  const count = parseChunkMarker(head);
  if (count === null) return head;
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(`${k}.${i}`);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function secureDelete(key: string): Promise<void> {
  const k = secureKey(key);
  const count = parseChunkMarker(await SecureStore.getItemAsync(k));
  if (count !== null) {
    for (let i = 0; i < count; i += 1)
      await SecureStore.deleteItemAsync(`${k}.${i}`);
  }
  await SecureStore.deleteItemAsync(k);
}

async function secureWrite(key: string, value: string): Promise<void> {
  const k = secureKey(key);
  await secureDelete(key);
  const chunks = splitIntoChunks(value);
  if (chunks.length === 1) {
    await SecureStore.setItemAsync(k, value);
    return;
  }
  for (let i = 0; i < chunks.length; i += 1)
    await SecureStore.setItemAsync(`${k}.${i}`, chunks[i]);
  await SecureStore.setItemAsync(k, `${CHUNK_MARKER}${chunks.length}`);
}

/** In-memory cache: each key hits the Keystore at most once per app run. */
const memory = new Map<string, string | null>();

export function __resetSecureTokenCacheForTests(): void {
  memory.clear();
}

export const secureTokenStorage = {
  async getItem(key: string): Promise<string | null> {
    if (memory.has(key)) return memory.get(key) ?? null;
    const value = await loadItem(key);
    memory.set(key, value);
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
    await storeItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.set(key, null);
    await secureDelete(key).catch(() => undefined);
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

async function loadItem(key: string): Promise<string | null> {
  try {
    const secure = await secureRead(key);
    if (secure !== null) return secure;
  } catch {
    return AsyncStorage.getItem(key);
  }
  // One-time migration from AsyncStorage.
  const legacy = await AsyncStorage.getItem(key).catch(() => null);
  if (legacy === null) return null;
  try {
    await secureWrite(key, legacy);
    if ((await secureRead(key)) === legacy) await AsyncStorage.removeItem(key);
  } catch {
    /* keep legacy copy; still logged in */
  }
  return legacy;
}

async function storeItem(key: string, value: string): Promise<void> {
  try {
    await secureWrite(key, value);
    await AsyncStorage.removeItem(key).catch(() => undefined);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}
