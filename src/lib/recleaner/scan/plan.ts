import type { Finding } from "../health.ts";

export type RepairRisk = "safe" | "low" | "moderate" | "high";

export type RepairRecommendation = {
  id: string;
  title: string;
  reason: string;
  severity: "low" | "moderate" | "high";
  actionId: string;
  requiresAdmin: boolean;
  estimatedDuration?: string;
  risk: RepairRisk;
  prerequisites?: string[];
  dependencies?: string[];
  verificationActionId?: string;
  selected: boolean;
};

export type RepairPlan = {
  steps: RepairRecommendation[];
  recommendRestore: boolean;
};

const ORDER = ["dism-smart", "sfc-smart", "wu-repair", "clean-temp", "dns-flush", "firewall-enable"];

function bytesLabel(marks: Record<string, string>): string | null {
  const bytes = Number(marks.TEMP_BYTES);
  if (!Number.isFinite(bytes) || bytes < 1048576) return null;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  return `${Math.round(bytes / 1048576)} MB`;
}

export function buildRepairPlan(findings: Finding[]): RepairPlan {
  const byRepair = new Map<string, Finding>();
  for (const finding of findings) {
    if (finding.repairId) byRepair.set(finding.repairId, finding);
  }
  const firewall = findings.find((item) => item.id === "firewall");
  const steps: RepairRecommendation[] = [];

  const image = byRepair.get("dism-smart");
  if (image) {
    steps.push({
      id: "dism-smart",
      title: "Repair the component store",
      reason: image.summary,
      severity: "moderate",
      actionId: "dism-smart",
      requiresAdmin: true,
      estimatedDuration: "10–40 min",
      risk: "moderate",
      verificationActionId: "dism-check",
      selected: true,
    });
  }

  const files = byRepair.get("sfc-smart");
  if (files) {
    steps.push({
      id: "sfc-smart",
      title: "Repair system files",
      reason: image ? `${files.summary} This runs after the component store repair.` : files.summary,
      severity: "moderate",
      actionId: "sfc-smart",
      requiresAdmin: true,
      estimatedDuration: "10–30 min",
      risk: "moderate",
      dependencies: image ? ["dism-smart"] : [],
      verificationActionId: "sfc-verify",
      selected: true,
    });
  }

  const update = byRepair.get("wu-repair");
  if (update) {
    steps.push({
      id: "wu-repair",
      title: "Repair Windows Update",
      reason: update.summary,
      severity: "moderate",
      actionId: "wu-repair",
      requiresAdmin: true,
      estimatedDuration: "several minutes",
      risk: "moderate",
      verificationActionId: "wu-diagnose",
      selected: true,
    });
  }

  const temp = byRepair.get("clean-temp");
  if (temp) {
    const size = bytesLabel(temp.marks);
    steps.push({
      id: "clean-temp",
      title: size ? `Clean ${size} of temporary files` : "Clean temporary files",
      reason: temp.summary,
      severity: "low",
      actionId: "clean-temp",
      requiresAdmin: true,
      estimatedDuration: "a few minutes",
      risk: "safe",
      verificationActionId: "disk-diagnose",
      selected: true,
    });
  }

  const dns = byRepair.get("dns-flush");
  if (dns) {
    steps.push({
      id: "dns-flush",
      title: "Flush the DNS cache",
      reason: dns.summary,
      severity: "low",
      actionId: "dns-flush",
      requiresAdmin: false,
      estimatedDuration: "under a minute",
      risk: "low",
      verificationActionId: "network-diagnose",
      selected: false,
    });
  }

  if (firewall && (firewall.grade === "attention" || firewall.grade === "critical" || firewall.grade === "warning")) {
    steps.push({
      id: "firewall-enable",
      title: "Enable firewall profiles",
      reason: firewall.summary,
      severity: "high",
      actionId: "firewall-enable",
      requiresAdmin: true,
      risk: "high",
      prerequisites: ["This changes protection state. It does not reset custom rules."],
      selected: false,
    });
  }

  steps.sort((a, b) => ORDER.indexOf(a.actionId) - ORDER.indexOf(b.actionId));
  const recommendRestore = steps.some((step) => step.selected && (step.risk === "moderate" || step.risk === "high"));
  return { steps, recommendRestore };
}
