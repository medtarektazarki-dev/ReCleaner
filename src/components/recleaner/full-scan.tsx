import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDuration, formatGiB, formatStamp, formatUptime, platformLabel } from "@/lib/recleaner/format";
import { gradeLabel, healthScore, type Finding, type Grade } from "@/lib/recleaner/health";
import { statusLabel } from "@/lib/recleaner/scan/score";
import type { HostProfile, ServerResult } from "@/lib/recleaner/types";
import { SystemCore } from "./core";

export type ScanRow = {
  id: string;
  label: string;
  actionId: string;
  phase: "waiting" | "running" | "done";
  result?: ServerResult;
};

function rowGrade(row: ScanRow, findings: Finding[]): Grade | "pending" | "checking" {
  if (row.phase === "running") return "checking";
  if (row.phase === "waiting") return "pending";
  return findings.find((item) => item.id === row.id)?.grade ?? "unknown";
}

function gradeTone(grade: Grade | "pending" | "checking"): string {
  if (grade === "healthy") return "text-ok";
  if (grade === "attention" || grade === "warning") return "text-warn";
  if (grade === "critical") return "text-danger";
  if (grade === "checking") return "text-fg";
  return "text-subtle";
}

export function FullScanScreen({
  profile,
  posture,
  busy,
  rows,
  findings,
  onScan,
  onRepair,
  onOpenSecurity,
  onFirewall,
  onDetails,
  repairCount,
  job,
  scanNote,
  scanStarted,
  beforeScore,
  onCancelScan,
}: {
  profile: HostProfile;
  posture: "steady" | "watch" | "strained";
  busy: boolean;
  rows: ScanRow[];
  findings: Finding[] | null;
  onScan: () => void;
  onRepair: () => void;
  onOpenSecurity: () => void;
  onFirewall: () => void;
  onDetails: (result: ServerResult, tool: string) => void;
  repairCount: number;
  job: { title: string; steps: { label: string; actionId: string; state: string; summary?: string }[] } | null;
  scanNote: string | null;
  scanStarted: number | null;
  beforeScore: number | null;
  onCancelScan: () => void;
}) {
  const [math, setMath] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scored = findings ? healthScore(findings) : null;
  const scanning = busy && rows.some((row) => row.phase !== "done");
  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [scanning]);
  const issues = findings?.filter((item) => item.grade === "attention" || item.grade === "warning" || item.grade === "critical") ?? [];
  const counts = {
    healthy: findings?.filter((item) => item.grade === "healthy").length ?? 0,
    warning: findings?.filter((item) => item.grade === "attention" || item.grade === "warning").length ?? 0,
    critical: findings?.filter((item) => item.grade === "critical").length ?? 0,
    unknown: findings?.filter((item) => item.grade === "unknown").length ?? 0,
  };
  const windows = findings?.find((item) => item.id === "windows");
  const unsupported = windows?.marks.WINDOWS11 === "no";
  const defender = findings?.find((item) => item.id === "security");
  const firewall = findings?.find((item) => item.id === "firewall");

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <section className="flex flex-1 flex-col items-center px-6 py-8 text-center">
        <p className="text-xs tracking-widest text-subtle">{findings && !scanning ? "SYSTEM HEALTH" : "FULL SYSTEM SCAN"}</p>
        {scanning ? (
          <>
            <h1 className="mt-3 text-3xl font-medium tracking-tight">Checking Windows</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted">
              {scanStarted ? `Elapsed ${formatDuration(Math.max(0, now - scanStarted))}. ` : ""}
              Each line waits for that diagnostic. There is no estimated percent.
            </p>
            {scanNote ? <p className="mt-2 max-w-md text-sm text-warn">{scanNote}</p> : null}
          </>
        ) : findings && scored ? (
          <>
            <h1 className="mt-3 text-5xl font-medium tracking-tight tabular-nums">{scored.score == null ? "—" : scored.score}</h1>
            <p className="mt-2 text-sm text-muted">{statusLabel(scored.status)}</p>
            {beforeScore != null && scored.score != null ? <p className="mt-1 text-xs text-subtle">Before {beforeScore}</p> : null}
          </>
        ) : (
          <>
            <h1 className="mt-3 max-w-xl text-3xl font-medium tracking-tight">Analyze this PC</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted">
              Checks Windows 11, then reports only what each diagnostic actually returned. It does not repair anything by itself.
            </p>
          </>
        )}
        {unsupported ? <p className="mt-4 text-sm text-danger">Windows 11 required. This installation is not Windows 11.</p> : null}
        <SystemCore level={posture} live={scanning} />
        <p className="text-xs tracking-widest text-subtle">SYSTEM CORE</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" disabled={busy} className="h-11 rounded-md bg-paper px-4 text-sm font-medium text-paper-fg disabled:opacity-40" onClick={onScan}>
            {scanning ? "Scanning…" : findings ? "Scan again" : "Full system scan"}
          </button>
          {scanning ? (
            <button type="button" className="h-11 rounded-md border border-line px-4 text-sm font-medium" onClick={onCancelScan}>
              Cancel scan
            </button>
          ) : null}
          {findings && !scanning ? (
            <button type="button" disabled={busy || repairCount === 0} className="h-11 rounded-md border border-line px-4 text-sm font-medium disabled:opacity-40" onClick={onRepair}>
              Review & repair
            </button>
          ) : null}
        </div>
        {rows.length > 0 ? (
          <ol className="mt-8 w-full max-w-lg space-y-3 text-left">
            {rows.map((row) => {
              const grade = rowGrade(row, findings ?? []);
              const finding = findings?.find((item) => item.id === row.id);
              return (
                <li key={row.id} className="flex items-start justify-between gap-4 border-t border-line pt-3">
                  <span className="min-w-0">
                    <span className="block text-sm">{row.label}</span>
                    {finding && row.phase === "done" ? <span className="mt-1 block text-xs leading-5 text-muted">{finding.summary}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className={cn("text-xs", gradeTone(grade))}>
                      {grade === "checking" ? "Checking" : grade === "pending" ? "Pending" : gradeLabel(grade)}
                    </span>
                    {row.result && row.phase === "done" ? (
                      <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={() => onDetails(row.result!, row.label)}>
                        Details
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
        {job && !scanning ? (
          <ol className="mt-8 w-full max-w-lg space-y-3 text-left">
            <li className="text-xs tracking-widest text-subtle">{job.title.toUpperCase()}</li>
            {job.steps.map((step, index) => (
              <li key={`${step.actionId}-${index}`} className="flex items-start justify-between gap-4 border-t border-line pt-3">
                <span>
                  <span className="block text-sm">{step.label}</span>
                  {step.summary ? <span className="mt-1 block text-xs leading-5 text-muted">{step.summary}</span> : null}
                </span>
                <span className={cn("text-xs", gradeTone(step.state === "running" ? "checking" : step.state === "success" ? "healthy" : step.state === "error" ? "critical" : "attention"))}>
                  {step.state === "running" ? "Running" : step.state === "waiting" ? "Pending" : step.state === "blocked" ? "Not started" : step.state}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <aside className="border-t border-line px-6 py-8 lg:w-96 lg:border-t-0 lg:border-l">
        {findings && !scanning && scored ? (
          <>
            <p className="text-xs tracking-widest text-subtle">ISSUES FOUND</p>
            <p className="mt-2 text-3xl font-medium tabular-nums">{issues.length}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Side k="Healthy" v={String(counts.healthy)} />
              <Side k="Warnings" v={String(counts.warning)} />
              <Side k="Critical" v={String(counts.critical)} />
              <Side k="Unknown" v={String(counts.unknown)} />
            </dl>
            <ul className="mt-4 space-y-3">
              {issues.length === 0 ? <li className="text-sm text-muted">No scored category needs attention.</li> : null}
              {issues.map((item) => (
                <li key={item.id} className="text-sm leading-6">
                  <span className={gradeTone(item.grade)}>{gradeLabel(item.grade)}</span>
                  <span className="text-muted"> · {item.label}</span>
                </li>
              ))}
            </ul>
            {defender && defender.grade !== "healthy" && defender.grade !== "unknown" ? (
              <button type="button" className="mt-4 text-sm underline underline-offset-4" onClick={onOpenSecurity}>
                Open Security
              </button>
            ) : null}
            {firewall && (firewall.grade === "attention" || firewall.grade === "critical") ? (
              <button type="button" className="mt-3 block text-sm underline underline-offset-4" onClick={onFirewall}>
                Review firewall
              </button>
            ) : null}
            <button type="button" className="mt-6 text-xs tracking-widest text-subtle" onClick={() => setMath((value) => !value)}>
              {math ? "HIDE CALCULATION" : "HOW IS THIS CALCULATED?"}
            </button>
            {math ? (
              <div className="mt-3 space-y-2 text-xs leading-5 text-muted">
                <p>Weighted categories only. Healthy 100% of its weight, attention 75%, warning 50%, critical 0. Unknown results are left out and the remaining weights are scaled to 100. Windows version, memory, events, apps, shell, startup, and WMI are reported and do not move the score.</p>
                <ul className="space-y-1">
                  {scored.rows.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3">
                      <span>{row.id}</span>
                      <span className="tabular-nums">{row.points == null ? "—" : `${row.points}/${row.weight}`}</span>
                    </li>
                  ))}
                </ul>
                <p>{scored.included.length} weighted categories included. {scored.excluded.length} not in the score.</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-xs tracking-widest text-subtle">THIS HOST</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              {profile.isWindows
                ? "A full scan reads Windows. It does not upload logs or change security settings."
                : "These diagnostics run on Windows only. From here they report unavailable and do not invent a score."}
            </p>
          </>
        )}
        <dl className="mt-8 space-y-3 text-sm">
          <Side k="Platform" v={`${platformLabel(profile.platform)} ${profile.arch}`} />
          <Side k="Memory" v={`${formatGiB(profile.freeMem)} / ${formatGiB(profile.totalMem)} GB free`} />
          <Side k="Uptime" v={formatUptime(profile.uptime)} />
          <Side k="Administrator" v={profile.isWindows ? (profile.isAdmin ? "Yes" : "No") : "Not Windows"} />
          <Side k="Last reading" v={formatStamp(profile.readAt)} />
        </dl>
      </aside>
    </div>
  );
}

function Side({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-subtle">{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  );
}
