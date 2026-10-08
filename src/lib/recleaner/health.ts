import type { ServerResult } from "./types";
import { buildRepairPlan } from "./scan/plan.ts";
import { scoreFindings, type ScanStatus } from "./scan/score.ts";

export type Grade = "healthy" | "attention" | "warning" | "critical" | "unknown";

export type Finding = {
  id: string;
  label: string;
  actionId: string;
  grade: Grade;
  summary: string;
  repairId?: string;
  marks: Record<string, string>;
};

export type RepairChoice = {
  actionId: string;
  title: string;
  detail: string;
  selected: boolean;
  risk: "safe" | "low" | "moderate" | "high";
};

export const SCAN_STEPS: { id: string; label: string; actionId: string }[] = [
  { id: "windows", label: "Windows", actionId: "win-info" },
  { id: "memory", label: "Memory", actionId: "host-read" },
  { id: "image", label: "Windows image", actionId: "dism-check" },
  { id: "files", label: "System files", actionId: "sfc-verify" },
  { id: "update", label: "Windows Update", actionId: "wu-diagnose" },
  { id: "security", label: "Security", actionId: "defender-status" },
  { id: "firewall", label: "Firewall", actionId: "firewall-status" },
  { id: "disk", label: "Disk", actionId: "disk-diagnose" },
  { id: "network", label: "Network", actionId: "network-diagnose" },
  { id: "services", label: "Services", actionId: "services-diagnostic" },
  { id: "apps", label: "Applications", actionId: "winget-diagnose" },
  { id: "events", label: "Events", actionId: "events-diagnose" },
  { id: "crashes", label: "Crashes", actionId: "bsod-diagnose" },
  { id: "wmi", label: "System management", actionId: "wmi-diagnose" },
  { id: "shell", label: "Shell", actionId: "shell-diagnose" },
  { id: "startup", label: "Startup", actionId: "startup-diagnose" },
];

const ALLOWED_REPAIRS = new Set(["dism-smart", "sfc-smart", "clean-temp", "wu-repair", "dns-flush"]);
const MIN_CLEAN_BYTES = 200 * 1024 * 1024;

export function parseMarks(output: string): Record<string, string> {
  const marks: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1]) marks[match[1]] = (match[2] ?? "").trim();
  }
  return marks;
}

export function gradeOf(value: string | undefined): Grade {
  if (value === "healthy" || value === "attention" || value === "warning" || value === "critical" || value === "unknown") return value;
  return "unknown";
}

export function classifySfc(text: string, exitCode?: number | null): { grade: Grade; summary: string; repairId?: string } {
  if (/successfully repaired/i.test(text) || /did not find any integrity violations/i.test(text)) {
    return { grade: "healthy", summary: "Protected system files reported no remaining integrity violations. Repair was not started." };
  }
  if (/found integrity violations/i.test(text)) {
    return {
      grade: "warning",
      summary: "Integrity violations were reported. sfc /scannow was not started.",
      repairId: "sfc-smart",
    };
  }
  if (exitCode === 0) {
    return { grade: "healthy", summary: "System file verification returned exit code 0. Repair was not started." };
  }
  if (exitCode === 1) {
    return {
      grade: "warning",
      summary: "System file verification returned exit code 1. sfc /scannow was not started.",
      repairId: "sfc-smart",
    };
  }
  return { grade: "unknown", summary: "The verification result was not clear. Repair was not started." };
}

export function serviceNeedsAttention(state: string, startMode: string): boolean {
  return /^stopped$/i.test(state) && /^(auto|automatic)$/i.test(startMode);
}

export function failureFinding(step: { id: string; label: string; actionId: string }): Finding {
  return {
    ...step,
    grade: "unknown",
    summary: "This check failed. The scan continued.",
    marks: {},
  };
}

export function scoreForScan(findings: Finding[], cancelled: boolean): ReturnType<typeof healthScore> {
  const scored = healthScore(findings);
  if (!cancelled) return scored;
  return { ...scored, score: null, status: "unknown" };
}

export function classifyDism(input: { check: string; imageState: string; scan: string | null }): {
  grade: Grade;
  summary: string;
  repairId?: string;
  needsScan: boolean;
} {
  const blob = `${input.check}\n${input.imageState}\n${input.scan ?? ""}`;
  if (/not repairable|NonRepairable/i.test(blob)) {
    return {
      grade: "critical",
      summary: "The component store is not repairable. RestoreHealth was not started.",
      needsScan: false,
    };
  }
  if (/No component store corruption detected|\bHealthy\b/i.test(blob)) {
    return {
      grade: "healthy",
      summary: "No component store corruption was detected. RestoreHealth was not started.",
      needsScan: false,
    };
  }
  if (/\brepairable\b/i.test(blob)) {
    return {
      grade: "warning",
      summary: "The component store is repairable. RestoreHealth was not started.",
      repairId: "dism-smart",
      needsScan: false,
    };
  }
  if (input.scan == null) {
    return { grade: "unknown", summary: "CheckHealth was not conclusive.", needsScan: true };
  }
  return { grade: "unknown", summary: "Image health was not clear. No repair was started.", needsScan: false };
}

function memoryGrade(output: string): { grade: Grade; summary: string } {
  const free = Number(output.match(/^free=(\d+)/m)?.[1]);
  const total = Number(output.match(/^total=(\d+)/m)?.[1]);
  if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0) {
    return { grade: "unknown", summary: "Memory could not be read." };
  }
  const ratio = free / total;
  const freeGb = (free / 1073741824).toFixed(1);
  const totalGb = (total / 1073741824).toFixed(1);
  const summary = `${freeGb} GB free of ${totalGb} GB. This is the current reading, not a claim that memory was optimized.`;
  if (ratio < 0.12) return { grade: "warning", summary };
  if (ratio < 0.22) return { grade: "attention", summary };
  return { grade: "healthy", summary };
}

export function findingFromResult(step: { id: string; label: string; actionId: string }, result: ServerResult): Finding {
  const marks = parseMarks(result.output);
  if (result.state === "unavailable" || result.state === "requires_admin" || result.state === "cancelled") {
    return { ...step, grade: "unknown", summary: result.summary, marks };
  }
  if (step.actionId === "host-read") {
    const memory = memoryGrade(result.output);
    return { ...step, grade: memory.grade, summary: memory.summary, marks };
  }
  let grade = gradeOf(marks.GRADE);
  const scanStep = SCAN_STEPS.some((item) => item.id === step.id);
  if (grade === "unknown" && !marks.GRADE && !scanStep) {
    if (result.state === "success") grade = "healthy";
    else if (result.state === "error") grade = "warning";
    else if (result.state === "warning") grade = "attention";
  }
  let repairId = marks.REPAIR && ALLOWED_REPAIRS.has(marks.REPAIR) ? marks.REPAIR : undefined;
  if (grade === "healthy" || grade === "unknown") repairId = undefined;
  if (repairId === "clean-temp") {
    const bytes = Number(marks.TEMP_BYTES);
    if (!Number.isFinite(bytes) || bytes < MIN_CLEAN_BYTES) repairId = undefined;
  }
  return {
    ...step,
    grade,
    summary: marks.SUMMARY || result.summary,
    repairId,
    marks,
  };
}

export function healthScore(findings: Finding[]): {
  score: number | null;
  status: ScanStatus;
  included: Finding[];
  excluded: Finding[];
  rows: ReturnType<typeof scoreFindings>["rows"];
} {
  const scored = scoreFindings(findings);
  const weightedIds = new Set(scored.rows.map((row) => row.id));
  const included = findings.filter((item) => weightedIds.has(item.id) && item.grade !== "unknown");
  const excluded = findings.filter((item) => !weightedIds.has(item.id) || item.grade === "unknown");
  return { score: scored.score, status: scored.status, included, excluded, rows: scored.rows };
}

export function repairChoices(findings: Finding[]): RepairChoice[] {
  return buildRepairPlan(findings).steps.map((step) => ({
    actionId: step.actionId,
    title: step.title,
    detail: step.reason,
    selected: step.selected,
    risk: step.risk,
  }));
}

export function recommendRestore(findings: Finding[]): boolean {
  return buildRepairPlan(findings).recommendRestore;
}

export function verifySteps(actionIds: string[]): { label: string; actionId: string }[] {
  const map: Record<string, { label: string; actionId: string }> = {
    "dism-smart": { label: "Verify Windows image", actionId: "dism-check" },
    "sfc-smart": { label: "Verify system files", actionId: "sfc-verify" },
    "wu-repair": { label: "Verify Windows Update", actionId: "wu-diagnose" },
    "dns-flush": { label: "Verify network", actionId: "network-diagnose" },
    "clean-temp": { label: "Verify disk", actionId: "disk-diagnose" },
  };
  const steps: { label: string; actionId: string }[] = [];
  const seen = new Set<string>();
  for (const id of actionIds) {
    const step = map[id];
    if (!step || seen.has(step.actionId)) continue;
    seen.add(step.actionId);
    steps.push(step);
  }
  return steps;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${Math.round(bytes / 1048576)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

export function gradeLabel(grade: Grade): string {
  if (grade === "healthy") return "Healthy";
  if (grade === "attention") return "Attention";
  if (grade === "warning") return "Warning";
  if (grade === "critical") return "Critical";
  return "Unknown";
}

export function pointsFor(grade: Grade): number | null {
  if (grade === "unknown") return null;
  if (grade === "healthy") return 100;
  if (grade === "attention") return 75;
  if (grade === "warning") return 50;
  return 0;
}
