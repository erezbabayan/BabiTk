import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? "";

function isValidConvexUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const isConvexConfigured =
  convexUrl.length > 0 && isValidConvexUrl(convexUrl);

let client: ConvexReactClient | null = null;

if (isConvexConfigured) {
  client = new ConvexReactClient(convexUrl);
}

export const convex = client;

export function requireConvex(): ConvexReactClient {
  if (!client) {
    throw new Error("Convex is not configured");
  }
  return client;
}
