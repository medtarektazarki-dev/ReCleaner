import type { Grade } from "../health.ts";

export type ScanStatus = "excellent" | "good" | "attention" | "critical" | "unknown";

/** Share of the score. Categories not listed are shown, but they do not move the number. */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  image: 15,
  files: 15,
  update: 10,
  security: 15,
  firewall: 10,
  disk: 15,
  services: 10,
  network: 5,
  crashes: 5,
};

const FRACTION: Record<Exclude<Grade, "unknown">, number> = {
  healthy: 1,
  attention: 0.75,
  warning: 0.5,
  critical: 0,
};

export type ScoreRow = {
  id: string;
  weight: number;
  fraction: number | null;
  points: number | null;
};

export function scoreFindings(findings: { id: string; grade: Grade }[]): {
  score: number | null;
  status: ScanStatus;
  weightUsed: number;
  rows: ScoreRow[];
} {
  const rows: ScoreRow[] = [];
  let weightUsed = 0;
  let earned = 0;
  for (const finding of findings) {
    const weight = CATEGORY_WEIGHTS[finding.id];
    if (!weight) continue;
    if (finding.grade === "unknown") {
      rows.push({ id: finding.id, weight, fraction: null, points: null });
      continue;
    }
    const fraction = FRACTION[finding.grade];
    const points = weight * fraction;
    rows.push({ id: finding.id, weight, fraction, points });
    weightUsed += weight;
    earned += points;
  }
  if (weightUsed === 0) return { score: null, status: "unknown", weightUsed: 0, rows };
  const score = Math.round((earned / weightUsed) * 100);
  const status: ScanStatus = score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "attention" : "critical";
  return { score, status, weightUsed, rows };
}

export function statusLabel(status: ScanStatus): string {
  if (status === "excellent") return "Excellent";
  if (status === "good") return "Good";
  if (status === "attention") return "Attention";
  if (status === "critical") return "Critical";
  return "Unknown";
}
