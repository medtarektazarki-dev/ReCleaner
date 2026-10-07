import { createServerFn } from "@tanstack/react-start";
import type { HostProfile, ServerResult } from "./types";

function parseInput(data: unknown): { actionId: string; params: Record<string, string> } {
  if (!data || typeof data !== "object") throw new Error("Invalid request");
  const actionId = (data as { actionId?: unknown }).actionId;
  if (typeof actionId !== "string" || !/^[a-z0-9-]{1,64}$/.test(actionId)) throw new Error("Invalid action");
  const params: Record<string, string> = {};
  const incoming = (data as { params?: unknown }).params;
  if (incoming && typeof incoming === "object") {
    for (const [key, value] of Object.entries(incoming)) {
      if (!/^[a-zA-Z]{1,32}$/.test(key)) continue;
      if (typeof value !== "string" || value.length > 260) throw new Error("Invalid parameter");
      params[key] = value;
    }
  }
  return { actionId, params };
}

export const getHostProfile = createServerFn({ method: "GET" }).handler(async (): Promise<HostProfile> => {
  const { readHost } = await import("./runner.server");
  return readHost();
});

export const runAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseInput(data))
  .handler(async ({ data }): Promise<ServerResult> => {
    const { executeAction } = await import("./runner.server");
    return executeAction(data.actionId, data.params);
  });
