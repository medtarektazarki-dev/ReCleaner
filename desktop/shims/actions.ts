import type { HostProfile, ServerResult } from "@/lib/recleaner/types";

export async function getHostProfile(): Promise<HostProfile> {
  throw new Error("REcleaner desktop bridge is not available.");
}

export async function runAction(): Promise<ServerResult> {
  throw new Error("REcleaner desktop bridge is not available.");
}
