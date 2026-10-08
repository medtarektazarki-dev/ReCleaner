import type { Finding } from "../health.ts";
import { scoreFindings, type ScanStatus } from "./score.ts";

export type ScanReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  platform: string;
  windowsVersion?: string;
  build?: string;
  score: number | null;
  status: ScanStatus;
  diagnostics: Finding[];
  issues: Finding[];
  recommendations: { actionId: string; title: string; selected: boolean }[];
  canRepair: boolean;
  cancelled: boolean;
};

export function buildScanReport(input: {
  startedAt: string;
  finishedAt: string;
  platform: string;
  windowsVersion?: string;
  build?: string;
  findings: Finding[];
  recommendations: { actionId: string; title: string; selected: boolean }[];
  cancelled: boolean;
}): ScanReport {
  const scored = scoreFindings(input.findings);
  const issues = input.findings.filter((item) => item.grade === "attention" || item.grade === "warning" || item.grade === "critical");
  return {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: Math.max(0, new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()),
    platform: input.platform,
    windowsVersion: input.windowsVersion,
    build: input.build,
    score: input.cancelled ? null : scored.score,
    status: input.cancelled ? "unknown" : scored.status,
    diagnostics: input.findings,
    issues,
    recommendations: input.recommendations,
    canRepair: input.recommendations.some((item) => item.selected),
    cancelled: input.cancelled,
  };
}
