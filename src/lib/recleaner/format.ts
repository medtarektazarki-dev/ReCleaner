import type { HostProfile, Risk, RunState } from "./types";

export function formatGiB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0.0";
  return (Math.round((bytes / 1073741824) * 10) / 10).toFixed(1);
}

export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 1000) return "< 00:01";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

export function resourcePosture(profile: HostProfile): {
  level: "steady" | "watch" | "strained";
  freeRatio: number;
  loadRatio: number;
  loadKnown: boolean;
} {
  const freeRatio = profile.totalMem > 0 ? profile.freeMem / profile.totalMem : 0;
  const loadKnown = profile.platform !== "win32" && profile.load1 > 0;
  const loadRatio = profile.cpus > 0 ? profile.load1 / profile.cpus : 0;
  const memBad = freeRatio < 0.12;
  const memFair = freeRatio < 0.22;
  const loadBad = loadKnown && loadRatio > 1.3;
  const loadFair = loadKnown && loadRatio > 0.85;
  const level = memBad || loadBad ? "strained" : memFair || loadFair ? "watch" : "steady";
  return { level, freeRatio, loadRatio, loadKnown };
}

export function postureLabel(level: "steady" | "watch" | "strained"): string {
  if (level === "steady") return "Steady";
  if (level === "watch") return "Watch";
  return "Strained";
}

export function riskLabel(risk: Risk): string {
  if (risk === "safe") return "Safe";
  if (risk === "low") return "Low risk";
  if (risk === "moderate") return "Moderate";
  return "High impact";
}

export function stateLabel(state: RunState): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    case "requires_admin":
      return "Needs admin";
    case "unavailable":
      return "Unavailable";
  }
}

export function platformLabel(platform: string): string {
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  if (platform === "darwin") return "macOS";
  return platform || "Unknown";
}
