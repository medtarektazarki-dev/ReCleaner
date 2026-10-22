import { createServerFn } from "@tanstack/react-start";
import { parseRunRequest } from "./request.ts";
import type { HostProfile, ServerResult } from "./types";

function parseInput(data: unknown): { actionId: string; params: Record<string, string> } {
  const body = data && typeof data === "object" ? (data as { actionId?: unknown; params?: unknown }) : {};
  const request = parseRunRequest(body.actionId, body.params);
  if (!request.ok) throw new Error(request.message);
  return { actionId: request.actionId, params: request.params };
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
