const ACTION_ID = /^[a-z0-9-]{1,64}$/;
const PARAM_KEY = /^[a-zA-Z]{1,32}$/;
const MAX_PARAMS = 8;
export const MAX_PARAM_LENGTH = 260;

export type RunRequest = { ok: true; actionId: string; params: Record<string, string> } | { ok: false; message: string };

/**
 * The only shape a renderer may send: an action id and a few short string parameters. What those
 * parameters mean is decided by the action's own plan, never by the caller.
 */
export function parseRunRequest(actionId: unknown, params: unknown): RunRequest {
  if (typeof actionId !== "string" || !ACTION_ID.test(actionId)) return { ok: false, message: "Invalid action." };
  const clean: Record<string, string> = {};
  if (params !== undefined && params !== null) {
    if (typeof params !== "object" || Array.isArray(params)) return { ok: false, message: "Invalid parameters." };
    const entries = Object.entries(params);
    if (entries.length > MAX_PARAMS) return { ok: false, message: "Too many parameters." };
    for (const [key, value] of entries) {
      if (!PARAM_KEY.test(key)) return { ok: false, message: "Invalid parameter name." };
      if (typeof value !== "string" || value.length > MAX_PARAM_LENGTH) return { ok: false, message: "Invalid parameter value." };
      clean[key] = value;
    }
  }
  return { ok: true, actionId, params: clean };
}
