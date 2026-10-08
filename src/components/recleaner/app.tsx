import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  AppWindow,
  Cpu,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Minus,
  Package,
  ScrollText,
  Search,
  Settings,
  Settings2,
  SlidersHorizontal,
  Square,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV, SECTION_COPY, TOOLS, toolsIn } from "@/lib/recleaner/catalog";
import { getHostProfile, runAction } from "@/lib/recleaner/actions";
import {
  formatDuration,
  formatGiB,
  formatStamp,
  formatUptime,
  platformLabel,
  postureLabel,
  resourcePosture,
  riskLabel,
  stateLabel,
} from "@/lib/recleaner/format";
import { FIELD_META, commandPreview, getPlan, validateField, type FieldKey } from "@/lib/recleaner/plans";
import { useRecleaner } from "@/lib/recleaner/store";
import type { HostProfile, LogEntry, RunState, SectionId, ServerResult, Tool } from "@/lib/recleaner/types";
import { SystemCore } from "./core";
import { Mark, Wordmark } from "./mark";
import { isDesktop } from "@/lib/recleaner/desktop";
import { FullScanScreen, type ScanRow } from "./full-scan";
import { SCAN_STEPS, findingFromResult, healthScore, recommendRestore, repairChoices, verifySteps, type Finding, type RepairChoice } from "@/lib/recleaner/health";
import { buildScanReport } from "@/lib/recleaner/scan/report";
import { statusLabel } from "@/lib/recleaner/scan/score";

const ICONS: Record<SectionId, typeof Activity> = {
  overview: Activity,
  optimize: Activity,
  disk: HardDrive,
  repair: Wrench,
  security: LockKeyhole,
  advanced: SlidersHorizontal,
  drivers: Cpu,
  apps: Package,
  maintenance: AppWindow,
  accounts: Users,
  tweaks: Settings2,
  licensing: KeyRound,
  activity: ScrollText,
  settings: Settings,
};

const QUICK = [
  { label: "Image check", actionId: "dism-smart" },
  { label: "System files", actionId: "sfc-smart" },
  { label: "Temporary cleanup", actionId: "clean-temp" },
];

type JobStep = {
  label: string;
  actionId: string;
  state: "waiting" | "running" | "skipped" | "blocked" | RunState;
  summary?: string;
};

type Flow =
  | { kind: "confirm"; tool: Tool; acknowledged: boolean }
  | { kind: "restore"; tool: Tool; params: Record<string, string> }
  | { kind: "params"; tool: Tool; params: Record<string, string>; error?: string }
  | { kind: "details"; result: ServerResult; tool: string }
  | { kind: "repairs"; choices: RepairChoice[]; restore: boolean }
  | { kind: "close" };

function tone(state: string): string {
  if (state === "success") return "text-ok";
  if (state === "warning" || state === "requires_admin" || state === "watch") return "text-warn";
  if (state === "error" || state === "strained") return "text-danger";
  if (state === "running") return "text-fg";
  return "text-subtle";
}

function advice(profile: HostProfile): string[] {
  const posture = resourcePosture(profile);
  const lines: string[] = [];
  if (!profile.isWindows) {
    lines.push("Repair and cleanup run only on Windows. Nothing on a PC is changed from this host.");
  } else if (!profile.isAdmin) {
    lines.push("Administrator access is required before a repair can start.");
  }
  if (posture.level === "strained") lines.push("Memory is low or the host is busy. Pause heavy work before a long task.");
  else if (posture.level === "watch") lines.push("Free memory is getting tight.");
  else if (profile.isWindows) lines.push("Resources look settled. Scan system only refreshes this reading.");
  return lines;
}

export function RecleanerApp({ initial }: { initial: HostProfile }) {
  const refreshServer = useServerFn(getHostProfile);
  const actServer = useServerFn(runAction);
  const settings = useRecleaner((s) => s.settings);
  const welcomeDone = useRecleaner((s) => s.welcomeDone);
  const hydrated = useRecleaner((s) => s.hydrated);
  const states = useRecleaner((s) => s.states);
  const hydrate = useRecleaner((s) => s.hydrate);
  const setSettings = useRecleaner((s) => s.setSettings);
  const finishWelcome = useRecleaner((s) => s.finishWelcome);
  const setToolState = useRecleaner((s) => s.setToolState);
  const record = useRecleaner((s) => s.record);

  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(initial);
  const [section, setSection] = useState<SectionId>("overview");
  const [query, setQuery] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [job, setJob] = useState<{ title: string; steps: JobStep[] } | null>(null);
  const [scanState, setScanState] = useState<RunState>("ready");
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanStarted, setScanStarted] = useState<number | null>(null);
  const [beforeScore, setBeforeScore] = useState<number | null>(null);
  const cancelScan = useRef(false);

  useEffect(() => {
    hydrate();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setBooting(false), reduced ? 0 : 1000);
    return () => window.clearTimeout(timer);
  }, [hydrate]);

  useEffect(() => {
    const onClose = () => setFlow({ kind: "close" });
    window.addEventListener("recleaner-close", onClose);
    return () => window.removeEventListener("recleaner-close", onClose);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!hydrated || !isDesktop()) return;
    void window.recleaner?.applySettings(settings);
  }, [hydrated, settings]);

  const posture = resourcePosture(profile);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TOOLS.filter((tool) => `${tool.title} ${tool.summary}`.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  async function refresh() {
    if (isDesktop()) return window.recleaner!.host();
    return refreshServer();
  }

  async function act(input: { data: { actionId: string; params: Record<string, string> } }): Promise<ServerResult> {
    if (isDesktop()) return window.recleaner!.run(input.data.actionId, input.data.params);
    return actServer(input);
  }

  function notify(title: string, body: string) {
    if (!isDesktop() || !useRecleaner.getState().settings.notifications) return;
    void window.recleaner?.notify(title, body);
  }

  async function relaunch() {
    const result = await act({ data: { actionId: "relaunch-admin", params: {} } });
    record("relaunch", "Restart as administrator", result);
    if (result.state !== "success") setFlow({ kind: "details", result, tool: "Restart as administrator" });
  }

  async function scan() {
    if (busy) return;
    setBusy(true);
    setScanState("running");
    const started = Date.now();
    try {
      const next = await refresh();
      setProfile(next);
      const result: ServerResult = {
        actionId: "host-read",
        title: "Scan system",
        state: "success",
        summary: next.isWindows
          ? "This PC was read. No changes were made."
          : "Host resources were read. No changes were made.",
        exitCode: 0,
        durationMs: Date.now() - started,
        output: [
          `platform ${next.platform}`,
          `cpus ${next.cpus}`,
          `free ${formatGiB(next.freeMem)} GB`,
          `total ${formatGiB(next.totalMem)} GB`,
          `admin ${next.isAdmin ? "yes" : "no"}`,
        ].join("\n"),
        startedAt: new Date(started).toISOString(),
        commands: ["Read processor, memory, uptime, platform, and administrator state."],
        isWindows: next.isWindows,
      };
      record("scan", "Scan system", result);
      setScanState("success");
    } catch (error) {
      const result: ServerResult = {
        actionId: "host-read",
        title: "Scan system",
        state: "error",
        summary: error instanceof Error ? error.message : "The reading failed.",
        exitCode: 1,
        durationMs: Date.now() - started,
        output: "",
        startedAt: new Date(started).toISOString(),
        commands: [],
        isWindows: profile.isWindows,
      };
      record("scan", "Scan system", result);
      setScanState("error");
    } finally {
      setBusy(false);
    }
  }

  async function fullScan() {
    if (busy) return;
    cancelScan.current = false;
    setScanNote(null);
    const started = new Date();
    setScanStarted(started.getTime());
    setBeforeScore(null);
    setBusy(true);
    setScanState("running");
    const rows: ScanRow[] = SCAN_STEPS.map((step) => ({ ...step, phase: "waiting" }));
    setScanRows(rows);
    const nextFindings: Finding[] = [];
    setFindings([]);
    let cancelled = false;
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const step = rows[index];
        if (!step) continue;
        if (cancelScan.current) {
          cancelled = true;
          for (let later = index; later < rows.length; later += 1) {
            const pending = rows[later];
            if (!pending || pending.phase === "done") continue;
            rows[later] = { ...pending, phase: "done" };
            nextFindings.push({
              id: pending.id,
              label: pending.label,
              actionId: pending.actionId,
              grade: "unknown",
              summary: "Not started. The scan was cancelled.",
              marks: {},
            });
          }
          setScanRows([...rows]);
          setFindings([...nextFindings]);
          break;
        }
        const slow = step.actionId === "dism-check" || step.actionId === "sfc-verify";
        rows[index] = { ...step, phase: "running" };
        setScanRows([...rows]);
        const result = await runOne(
          {
            id: `scan-${step.id}`,
            section: "optimize",
            title: step.label,
            summary: "Full system scan",
            risk: "safe",
            actionId: step.actionId,
          },
          {},
        );
        if (step.actionId === "host-read") {
          try {
            setProfile(await refresh());
          } catch {
            /* the probe result still stands */
          }
        }
        rows[index] = { ...step, phase: "done", result };
        nextFindings.push(findingFromResult(step, result));
        setScanRows([...rows]);
        setFindings([...nextFindings]);
        if (cancelScan.current && slow) setScanNote("Windows is completing a non-interruptible operation.");
      }
      const finished = new Date().toISOString();
      const windows = nextFindings.find((item) => item.id === "windows");
      const choices = repairChoices(nextFindings);
      const report = buildScanReport({
        startedAt: started.toISOString(),
        finishedAt: finished,
        platform: profile.platform,
        windowsVersion: windows?.marks.PRODUCT,
        build: windows?.marks.BUILD,
        findings: nextFindings,
        recommendations: choices,
        cancelled,
      });
      const score = healthScore(nextFindings);
      record("full-scan", "Full system scan", {
        actionId: "full-scan",
        title: "Full system scan",
        state: cancelled ? "cancelled" : score.score == null ? "unavailable" : score.status === "excellent" || score.status === "good" ? "success" : "warning",
        summary: cancelled
          ? `Scan cancelled. ${score.score == null ? "Not scored from the checks that finished." : `Score ${score.score} from the checks that finished.`}`
          : score.score == null
            ? "Not scored. No weighted category returned a measured grade."
            : `Score ${score.score} · ${statusLabel(score.status)}. ${report.issues.length} issues. Nothing was repaired.`,
        exitCode: cancelled ? null : 0,
        durationMs: report.durationMs,
        output: nextFindings.map((item) => `${item.label}=${item.grade}`).join("\n"),
        startedAt: started.toISOString(),
        commands: ["Full system scan. Read-only diagnostics. Nothing was repaired."],
        isWindows: profile.isWindows,
      });
      setScanState(cancelled ? "cancelled" : score.score == null ? "unavailable" : "success");
    } finally {
      setBusy(false);
      setScanNote(null);
    }
  }

  async function executeRepairs(choices: RepairChoice[], withRestore: boolean) {
    const selected = choices.filter((item) => item.selected);
    setFlow(null);
    if (selected.length === 0) return;
    setBeforeScore(healthScore(findings ?? []).score);
    const planned: JobStep[] = [];
    if (withRestore && profile.isWindows) planned.push({ label: "Restore point", actionId: "restore-point", state: "waiting" });
    for (const item of selected) planned.push({ label: item.title, actionId: item.actionId, state: "waiting" });
    for (const step of verifySteps(selected.map((item) => item.actionId))) {
      planned.push({ label: step.label, actionId: step.actionId, state: "waiting" });
    }
    const verifyIds = new Set(verifySteps(selected.map((item) => item.actionId)).map((step) => step.actionId));
    setJob({ title: "Recommended repair", steps: planned });
    setBusy(true);
    const nextSteps = planned.map((step) => ({ ...step }));
    let repairsOpen = true;
    let ranRepair = false;
    try {
      for (let index = 0; index < nextSteps.length; index += 1) {
        const step = nextSteps[index];
        if (!step) continue;
        const verifying = verifyIds.has(step.actionId) && step.label.startsWith("Verify");
        if (verifying && !ranRepair) {
          nextSteps[index] = { ...step, state: "blocked", summary: "No repair ran, so verification was not started." };
          continue;
        }
        if (!repairsOpen && !verifying) {
          nextSteps[index] = { ...step, state: "blocked", summary: "Stopped because the restore point or administrator check did not succeed." };
          continue;
        }
        if (!profile.isWindows && step.actionId !== "host-read") {
          nextSteps[index] = { ...step, state: "blocked", summary: "Windows required. Not started." };
          continue;
        }
        nextSteps[index] = { ...step, state: "running" };
        setJob({ title: "Recommended repair", steps: [...nextSteps] });
        const result = await runOne(
          {
            id: `repair-${step.actionId}-${index}`,
            section: "optimize",
            title: step.label,
            summary: "Recommended repair",
            risk: "moderate",
            actionId: step.actionId,
          },
          {},
        );
        nextSteps[index] = { ...step, state: result.state, summary: result.summary };
        if (!verifying && step.actionId !== "restore-point" && (result.state === "success" || result.state === "warning")) ranRepair = true;
        if (step.actionId === "restore-point" && result.state !== "success") repairsOpen = false;
        if (result.state === "requires_admin") repairsOpen = false;
        if (verifying) {
          const match = SCAN_STEPS.find((item) => item.actionId === step.actionId);
          if (match) {
            setFindings((current) => current?.map((item) => (item.actionId === step.actionId ? findingFromResult(match, result) : item)) ?? current);
            setScanRows((current) => current.map((row) => (row.actionId === step.actionId ? { ...row, phase: "done", result } : row)));
          }
        }
      }
    } finally {
      setJob({ title: "Recommended repair", steps: nextSteps });
      setBusy(false);
      const failed = nextSteps.filter((step) => step.state === "error" || step.state === "warning" || step.state === "requires_admin");
      notify("Recommended repair", failed.length === 0 ? "Verification finished. Read each line before treating the PC as repaired." : "Repair finished with items that still need attention.");
    }
  }

  async function runOne(tool: Tool, params: Record<string, string>): Promise<ServerResult> {
    setToolState(tool.id, "running");
    const result = await act({ data: { actionId: tool.actionId, params } });
    record(tool.id, tool.title, result);
    return result;
  }

  async function runSequence(title: string, steps: { label: string; actionId: string }[], includeRestore: boolean) {
    const planned: JobStep[] = [];
    if (includeRestore && profile.isWindows) {
      planned.push({ label: "Restore point", actionId: "restore-point", state: "waiting" });
    }
    for (const step of steps) planned.push({ ...step, state: "waiting" });
    setJob({ title, steps: planned });
    setBusy(true);
    let windows = profile.isWindows;
    const nextSteps = planned.map((step) => ({ ...step }));
    try {
    for (let i = 0; i < nextSteps.length; i += 1) {
      const step = nextSteps[i];
      if (!step) continue;
      if (!windows && step.actionId !== "host-read") {
        nextSteps[i] = { ...step, state: "blocked", summary: "Windows required. Not started." };
        continue;
      }
      nextSteps[i] = { ...step, state: "running" };
      setJob({ title, steps: [...nextSteps] });
      const fake: Tool = {
        id: `job-${step.actionId}`,
        section: "optimize",
        title: step.label,
        summary: title,
        risk: "safe",
        actionId: step.actionId,
      };
      const result = await runOne(fake, {});
      if (step.actionId === "host-read") {
        windows = result.isWindows;
        try {
          setProfile(await refresh());
        } catch {
          windows = result.isWindows;
        }
      }
      const halted =
        result.state === "unavailable" ||
        result.state === "requires_admin" ||
        result.state === "error" ||
        (step.actionId === "restore-point" && result.state !== "success");
      nextSteps[i] = { ...step, state: result.state, summary: result.summary };
      if (halted && step.actionId !== "host-read") {
        for (let j = i + 1; j < nextSteps.length; j += 1) {
          const later = nextSteps[j];
          if (later) nextSteps[j] = { ...later, state: "blocked", summary: "Stopped because the previous step did not succeed." };
        }
        break;
      }
      if (!windows && step.actionId === "host-read") {
        for (let j = i + 1; j < nextSteps.length; j += 1) {
          const later = nextSteps[j];
          if (later) nextSteps[j] = { ...later, state: "blocked", summary: "Windows required. Not started." };
        }
        break;
      }
    }
    } finally {
      setJob({ title, steps: nextSteps });
      setBusy(false);
      const finished = [...nextSteps].reverse().find((step) => step.summary);
      notify(title, finished?.summary ?? "Finished.");
    }
  }

  function begin(tool: Tool) {
    if (busy) return;
    if (tool.confirm && (tool.risk === "moderate" || tool.risk === "high")) {
      setFlow({ kind: "confirm", tool, acknowledged: false });
      return;
    }
    void afterConfirm(tool, {});
  }

  async function afterConfirm(tool: Tool, params: Record<string, string>) {
    const plan = getPlan(tool.actionId);
    if (tool.restorePoint && settings.restoreBeforeRepair && profile.isWindows && tool.suite !== "quick") {
      setFlow({ kind: "restore", tool, params });
      return;
    }
    if (!tool.suite && plan?.fields?.length) {
      setFlow({ kind: "params", tool, params });
      return;
    }
    setFlow(null);
    if (tool.suite === "quick") {
      await runSequence("Quick repair", QUICK, settings.restoreBeforeRepair && profile.isWindows);
      return;
    }
    setBusy(true);
    try {
      const result = await runOne(tool, params);
      notify(tool.title, result.summary);
    } finally {
      setBusy(false);
    }
  }

  async function smartRepair(withRestore: boolean) {
    setFlow(null);
    const steps = [{ label: "System check", actionId: "host-read" }];
    if (withRestore) steps.push({ label: "Restore point", actionId: "restore-point" });
    steps.push(...QUICK, { label: "Service verification", actionId: "services-diagnostic" }, { label: "Final verification", actionId: "host-read" });
    await runSequence("Smart repair", steps, false);
  }

  function askSmart() {
    if (busy) return;
    if (!profile.isWindows || !settings.restoreBeforeRepair) {
      void smartRepair(false);
      return;
    }
    setFlow({
      kind: "restore",
      tool: {
        id: "smart",
        section: "optimize",
        title: "Smart repair",
        summary: "",
        risk: "moderate",
        actionId: "host-read",
        suite: "quick",
      },
      params: { smart: "1" },
    });
  }

  if (closed) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
        <Mark className="size-14" />
        <div>
          <Wordmark className="text-2xl" />
          <p className="mt-2 text-sm text-muted">REcleaner is closed.</p>
        </div>
        <button type="button" className="h-11 rounded-md bg-paper px-5 text-sm font-medium text-paper-fg" onClick={() => setClosed(false)}>
          Reopen
        </button>
      </main>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col bg-bg text-fg">
      {booting ? <Splash /> : null}
      <header className="app-drag flex h-12 shrink-0 items-center gap-3 border-b border-line px-3">
        <Mark className="size-5" />
        <Wordmark className="text-sm" />
        <span className="hidden text-sm text-subtle sm:inline">Repair. Clean. Optimize.</span>
        <span className="hidden text-xs text-subtle lg:inline">v1.0.0</span>
        <label className="app-no-drag ml-auto hidden min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-elevated px-3 md:flex md:max-w-xs">
          <Search className="size-4 text-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools"
            className="h-9 w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
            aria-label="Search tools"
          />
        </label>
        <div className="app-no-drag ml-auto flex md:ml-0">
          <Caption
            label="Minimize"
            onClick={() => {
              if (isDesktop()) {
                void window.recleaner?.window.minimize();
                return;
              }
              setMinimized(true);
            }}
          >
            <Minus className="size-4" />
          </Caption>
          <Caption
            label={expanded ? "Restore" : "Maximize"}
            onClick={() => {
              if (isDesktop()) {
                void window.recleaner?.window.toggleMaximize();
                return;
              }
              setMinimized(false);
              setExpanded((value) => !value);
            }}
          >
            <Square className="size-3.5" />
          </Caption>
          <Caption label="Close" onClick={() => setFlow({ kind: "close" })} danger>
            <X className="size-4" />
          </Caption>
        </div>
      </header>
      {minimized ? (
        <div className="flex flex-1 items-center justify-center">
          <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setMinimized(false)}>
            Restore REcleaner
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav className="hidden w-56 shrink-0 flex-col border-r border-line py-3 md:flex" aria-label="Sections">
            {NAV.map((item) => {
              const Icon = ICONS[item.id];
              const active = section === item.id && !query;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSection(item.id);
                  }}
                  className={cn(
                    "mx-2 flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm",
                    active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSection(item.id);
                  }}
                  className={cn(
                    "h-10 shrink-0 rounded-md px-3 text-sm",
                    section === item.id && !query ? "bg-elevated text-fg" : "text-muted",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {query ? (
                <SearchResults
                  tools={matches}
                  onOpen={(tool) => {
                    setQuery("");
                    setSection(tool.section);
                  }}
                />
              ) : section === "overview" ? (
                <FullScanScreen
                  profile={profile}
                  posture={posture.level}
                  busy={busy}
                  rows={scanRows}
                  findings={findings}
                  repairCount={repairChoices(findings ?? []).length}
                  onScan={() => void fullScan()}
                  onRepair={() => {
                    const choices = repairChoices(findings ?? []);
                    if (choices.length === 0) return;
                    setFlow({
                      kind: "repairs",
                      choices,
                      restore: profile.isWindows && settings.restoreBeforeRepair && recommendRestore(findings ?? []),
                    });
                  }}
                  onOpenSecurity={() => {
                    setBusy(true);
                    void runOne(
                      { id: "open-security", section: "security", title: "Open Windows Security", summary: "Opens Windows Security.", risk: "safe", actionId: "open-security" },
                      {},
                    ).finally(() => setBusy(false));
                  }}
                  onFirewall={() =>
                    begin({
                      id: "firewall-enable",
                      section: "security",
                      title: "Enable firewall",
                      summary: "Turns every firewall profile on.",
                      risk: "high",
                      acknowledge: true,
                      confirm: "Enable every Windows firewall profile? This changes protection state. It does not reset custom rules.",
                      actionId: "firewall-enable",
                    })
                  }
                  onDetails={(result, tool) => setFlow({ kind: "details", result, tool })}
                  job={job}
                  scanNote={scanNote}
                  scanStarted={scanStarted}
                  beforeScore={beforeScore}
                  onCancelScan={() => {
                    cancelScan.current = true;
                    setScanNote("Stopping after the current check. DISM and system file verification are not interrupted.");
                  }}
                />
              ) : section === "activity" ? (
                <ActivityView
                  showTechnical={settings.showTechnical}
                  onOpen={(result) => setFlow({ kind: "details", result, tool: result.tool })}
                />
              ) : section === "settings" ? (
                <SettingsView profile={profile} onRelaunch={() => void relaunch()} />
              ) : (
                <ToolList
                  section={section}
                  busy={busy}
                  states={states}
                  onRun={begin}
                  onDetails={(tool) => {
                    const result = useRecleaner.getState().results[tool.id];
                    if (result) setFlow({ kind: "details", result, tool: tool.title });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {!booting && hydrated && !welcomeDone ? (
        <Welcome
          onScan={() => {
            finishWelcome();
            setSection("overview");
            void fullScan();
          }}
          onSkip={finishWelcome}
        />
      ) : null}
      {flow?.kind === "repairs" ? (
        <RepairDialog
          choices={flow.choices}
          restore={flow.restore}
          allowRestore={profile.isWindows}
          onChange={(choices) => setFlow({ kind: "repairs", choices, restore: flow.restore })}
          onRestore={(restore) => setFlow({ kind: "repairs", choices: flow.choices, restore })}
          onCancel={() => setFlow(null)}
          onStart={() => void executeRepairs(flow.choices, flow.restore && profile.isWindows)}
        />
      ) : null}
      {flow?.kind === "confirm" ? (
        <ConfirmDialog
          tool={flow.tool}
          acknowledged={flow.acknowledged}
          onAcknowledge={(acknowledged) => setFlow({ ...flow, acknowledged })}
          onCancel={() => {
            setToolState(flow.tool.id, "cancelled");
            record(flow.tool.id, flow.tool.title, cancelled(flow.tool));
            setFlow(null);
          }}
          onContinue={() => void afterConfirm(flow.tool, {})}
        />
      ) : null}
      {flow?.kind === "restore" ? (
        <RestoreDialog
          onCancel={() => setFlow(null)}
          onSkip={() => {
            if (flow.params.smart) void smartRepair(false);
            else void continueWithoutRestore(flow.tool, flow.params);
          }}
          onCreate={() => {
            if (flow.params.smart) void smartRepair(true);
            else void continueWithRestore(flow.tool, flow.params);
          }}
        />
      ) : null}
      {flow?.kind === "params" ? (
        <ParamDialog
          tool={flow.tool}
          params={flow.params}
          error={flow.error}
          onChange={(params) => setFlow({ ...flow, params, error: undefined })}
          onCancel={() => setFlow(null)}
          onSubmit={() => {
            const plan = getPlan(flow.tool.actionId);
            const next = { ...flow.params };
            for (const field of plan?.fields ?? []) {
              const checked = validateField(field, next[field] ?? "", Boolean(plan?.optional?.includes(field)));
              if (!checked.ok) {
                setFlow({ ...flow, error: checked.message });
                return;
              }
              next[field] = checked.value;
            }
            setFlow(null);
            setBusy(true);
            void runOne(flow.tool, next).finally(() => setBusy(false));
          }}
        />
      ) : null}
      {flow?.kind === "details" ? (
        <DetailsDialog
          result={flow.result}
          tool={flow.tool}
          showTechnical={settings.showTechnical}
          onClose={() => setFlow(null)}
          onRelaunch={() => void relaunch()}
        />
      ) : null}
      {flow?.kind === "close" ? (
        <SimpleDialog title="Close REcleaner?" body="The window will close. Nothing is left running." onCancel={() => setFlow(null)}>
          <DialogButton
            onClick={() => {
              setFlow(null);
              if (isDesktop()) {
                void window.recleaner?.window.close();
                return;
              }
              setClosed(true);
            }}
          >
            Close
          </DialogButton>
        </SimpleDialog>
      ) : null}
    </div>
  );

  async function continueWithoutRestore(tool: Tool, params: Record<string, string>) {
    setFlow(null);
    const plan = getPlan(tool.actionId);
    if (plan?.fields?.length) {
      setFlow({ kind: "params", tool, params });
      return;
    }
    setBusy(true);
    try {
      await runOne(tool, params);
      const stored = useRecleaner.getState().results[tool.id];
      if (stored) notify(tool.title, stored.summary);
    } finally {
      setBusy(false);
    }
  }

  async function continueWithRestore(tool: Tool, params: Record<string, string>) {
    setFlow(null);
    setBusy(true);
    try {
      const point = await act({ data: { actionId: "restore-point", params: {} } });
      record(`${tool.id}-restore`, "Restore point", point);
      if (point.state !== "success") {
        setFlow({ kind: "details", result: point, tool: "Restore point" });
        return;
      }
      const plan = getPlan(tool.actionId);
      if (plan?.fields?.length) {
        setFlow({ kind: "params", tool, params });
        return;
      }
      await runOne(tool, params);
      const stored = useRecleaner.getState().results[tool.id];
      if (stored) notify(tool.title, stored.summary);
    } finally {
      setBusy(false);
    }
  }
}

function cancelled(tool: Tool): ServerResult {
  return {
    actionId: tool.actionId,
    title: tool.title,
    state: "cancelled",
    summary: "Cancelled before anything ran.",
    exitCode: null,
    durationMs: 0,
    output: "",
    startedAt: new Date().toISOString(),
    commands: getPlan(tool.actionId) ? commandPreview(getPlan(tool.actionId)!) : [],
    isWindows: false,
  };
}

function Splash() {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-bg">
      <Mark className="size-16" />
      <div className="text-center">
        <Wordmark className="text-3xl" />
        <p className="mt-2 text-sm text-muted">Repair. Clean. Optimize.</p>
        <p className="mt-1 text-xs text-subtle">REcleaner v1.0.0</p>
      </div>
    </div>
  );
}

function Caption({ children, label, onClick, danger }: { children: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("flex size-10 items-center justify-center text-muted hover:bg-elevated hover:text-fg", danger && "hover:text-danger")}
    >
      {children}
    </button>
  );
}

function Overview({
  profile,
  posture,
  scanState,
  busy,
  job,
  expanded,
  onScan,
  onSmart,
  onDetails,
}: {
  profile: HostProfile;
  posture: "steady" | "watch" | "strained";
  scanState: RunState;
  busy: boolean;
  job: { title: string; steps: JobStep[] } | null;
  expanded: boolean;
  onScan: () => void;
  onSmart: () => void;
  onDetails: (result: ServerResult, tool: string) => void;
}) {
  const lines = advice(profile);
  return (
    <div className={cn("flex min-h-full flex-col lg:flex-row", expanded && "lg:flex-col")}>
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <p className="text-xs tracking-widest text-subtle">SYSTEM HEALTH</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">{postureLabel(posture)}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">
          {formatGiB(profile.freeMem)} GB free of {formatGiB(profile.totalMem)} GB.{" "}
          {profile.isWindows
            ? "This is this PC. It is not an image-health verdict until a repair check runs."
            : "This is the host running REcleaner, not a Windows image verdict."}
        </p>
        <SystemCore level={posture} />
        <p className="text-xs tracking-widest text-subtle">SYSTEM CORE</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" disabled={busy} className="h-11 rounded-md border border-line px-4 text-sm font-medium disabled:opacity-40" onClick={onScan}>
            {scanState === "running" ? "Running…" : "Scan system"}
          </button>
          <button type="button" disabled={busy} className="h-11 rounded-md bg-paper px-4 text-sm font-medium text-paper-fg disabled:opacity-40" onClick={onSmart}>
            Smart repair
          </button>
        </div>
        <p className={cn("mt-3 text-xs", tone(scanState))}>{scanState === "ready" ? "Checks first. Changes nothing by itself." : stateLabel(scanState)}</p>
        {job ? (
          <ol className="mt-8 w-full max-w-md space-y-3 text-left">
            <li className="text-xs tracking-widest text-subtle">{job.title.toUpperCase()}</li>
            {job.steps.map((step) => (
              <li key={step.actionId + step.label} className="flex items-start justify-between gap-4 border-t border-line pt-3">
                <span>
                  <span className="block text-sm">{step.label}</span>
                  {step.summary ? <span className="mt-1 block text-xs text-muted">{step.summary}</span> : null}
                </span>
                <span className={cn("shrink-0 text-xs", tone(step.state))}>{step.state === "running" ? "Running…" : labelStep(step.state)}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <aside className="border-t border-line px-6 py-8 lg:w-80 lg:border-t-0 lg:border-l">
        <p className="text-xs tracking-widest text-subtle">SYSTEM STATUS</p>
        <dl className="mt-4 space-y-3 text-sm">
          <Status k="Platform" v={`${platformLabel(profile.platform)} ${profile.arch}`} />
          <Status k="Memory" v={`${formatGiB(profile.freeMem)} / ${formatGiB(profile.totalMem)} GB free`} />
          <Status k="Processor" v={`${profile.cpus} · ${trimCpu(profile.cpuModel)}`} />
          <Status k="Uptime" v={formatUptime(profile.uptime)} />
          <Status k="Administrator" v={profile.isWindows ? (profile.isAdmin ? "Yes" : "No") : "Not Windows"} />
          <Status k="Last reading" v={formatStamp(profile.readAt)} />
        </dl>
        <p className="mt-8 text-xs tracking-widest text-subtle">RECOMMENDATIONS</p>
        <ul className="mt-4 space-y-4">
          {lines.map((line) => (
            <li key={line} className="text-sm leading-6 text-muted">
              {line}
            </li>
          ))}
        </ul>
        {useRecleaner.getState().results.scan ? (
          <button
            type="button"
            className="mt-6 text-sm text-fg underline decoration-line underline-offset-4"
            onClick={() => {
              const result = useRecleaner.getState().results.scan;
              if (result) onDetails(result, "Scan system");
            }}
          >
            View last scan
          </button>
        ) : null}
      </aside>
    </div>
  );
}

function Status({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-subtle">{k}</dt>
      <dd className="text-right tabular-nums text-fg">{v}</dd>
    </div>
  );
}

function trimCpu(model: string): string {
  const clean = model.replace(/\s+/g, " ").trim();
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

function labelStep(state: JobStep["state"]): string {
  if (state === "waiting") return "Waiting";
  if (state === "blocked") return "Not started";
  if (state === "skipped") return "Skipped";
  return stateLabel(state as RunState);
}

function ToolList({
  section,
  busy,
  states,
  onRun,
  onDetails,
}: {
  section: SectionId;
  busy: boolean;
  states: Record<string, RunState>;
  onRun: (tool: Tool) => void;
  onDetails: (tool: Tool) => void;
}) {
  const tools = toolsIn(section);
  const dense = useRecleaner((s) => s.settings.density) === "compact";
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-medium tracking-tight">{NAV.find((item) => item.id === section)?.label}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{SECTION_COPY[section]}</p>
      <ul className="mt-6 border-t border-line">
        {tools.map((tool) => {
          const state = states[tool.id] ?? "ready";
          const plan = getPlan(tool.actionId);
          return (
            <li key={tool.id} className={cn("flex flex-col gap-3 border-b border-line sm:flex-row sm:items-center", dense ? "py-3" : "py-4")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-sm font-medium">{tool.title}</h2>
                  <span className={cn("text-xs", tool.risk === "high" ? "text-danger" : tool.risk === "moderate" ? "text-warn" : "text-subtle")}>
                    {riskLabel(tool.risk)}
                  </span>
                  {plan?.admin ? <span className="text-xs text-subtle">Administrator</span> : null}
                </div>
                <p className="mt-1 text-sm leading-6 text-muted">{tool.summary}</p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <span className={cn("text-xs", tone(state))}>{state === "running" ? "Running…" : stateLabel(state)}</span>
                {state !== "ready" && state !== "running" ? (
                  <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={() => onDetails(tool)}>
                    Details
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRun(tool)}
                  className="h-10 rounded-md bg-paper px-3 text-sm font-medium text-paper-fg disabled:opacity-40"
                >
                  {state === "running" ? "Running…" : "Run"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SearchResults({ tools, onOpen }: { tools: Tool[]; onOpen: (tool: Tool) => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-medium">Search</h1>
      {tools.length === 0 ? <p className="mt-4 text-sm text-muted">No matching tool.</p> : null}
      <ul className="mt-4 border-t border-line">
        {tools.map((tool) => (
          <li key={tool.id} className="border-b border-line py-4">
            <button type="button" className="text-left" onClick={() => onOpen(tool)}>
              <span className="block text-sm font-medium">{tool.title}</span>
              <span className="mt-1 block text-sm text-muted">{tool.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityView({
  showTechnical,
  onOpen,
}: {
  showTechnical: boolean;
  onOpen: (result: LogEntry) => void;
}) {
  const full = useRecleaner((s) => s.log);
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-medium">Activity</h1>
      <p className="mt-2 text-sm text-muted">Each run keeps its time, result, and exit code.</p>
      {full.length === 0 ? <p className="mt-8 text-sm text-muted">No operations yet.</p> : null}
      <ul className="mt-6 border-t border-line">
        {full.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-2 border-b border-line py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{entry.tool}</p>
              <p className="mt-1 text-sm text-muted">{entry.summary}</p>
            </div>
            <div className="flex items-center gap-4 text-xs tabular-nums text-subtle">
              <span className={tone(entry.state)}>{stateLabel(entry.state)}</span>
              <span>{formatDuration(entry.durationMs)}</span>
              {showTechnical ? <span>Exit {entry.exitCode ?? "—"}</span> : null}
              <button type="button" className="text-fg underline underline-offset-4" onClick={() => onOpen(entry)}>
                View details
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsView({ profile, onRelaunch }: { profile: HostProfile; onRelaunch: () => void }) {
  const settings = useRecleaner((s) => s.settings);
  const setSettings = useRecleaner((s) => s.setSettings);
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-medium">Settings</h1>
      <p className="mt-2 text-sm text-muted">REcleaner v1.0.0 · Windows repair and optimization</p>
      <Group title="General">
        <Toggle label="Create a restore point before repair" hint="Offered on Windows before actions marked as repairs." checked={settings.restoreBeforeRepair} onChange={(restoreBeforeRepair) => setSettings({ restoreBeforeRepair })} />
      </Group>
      <Group title="Appearance">
        <Toggle label="Light appearance" hint="The mark stays a dark symbol on light surfaces." checked={settings.theme === "light"} onChange={(on) => setSettings({ theme: on ? "light" : "dark" })} />
        <Toggle label="Compact lists" checked={settings.density === "compact"} onChange={(on) => setSettings({ density: on ? "compact" : "comfortable" })} />
      </Group>
      <Group title="Startup">
        <Toggle label="Launch with Windows" hint={isDesktop() ? "Opens REcleaner when you sign in to Windows." : "Saved for the Windows app. This view cannot register a startup task."} checked={settings.launchWithWindows} onChange={(launchWithWindows) => setSettings({ launchWithWindows })} />
        <Toggle label="Start minimized" hint={isDesktop() ? "Opens in the notification area." : "Saved for the Windows app."} checked={settings.runMinimized} onChange={(runMinimized) => setSettings({ runMinimized })} />
      </Group>
      <Group title="Notifications">
        <Toggle label="Completion notices" hint={isDesktop() ? "Shows a Windows notification when an operation finishes." : "Saved for the Windows app. Results still stay in Activity."} checked={settings.notifications} onChange={(notifications) => setSettings({ notifications })} />
      </Group>
      <Group title="Updates">
        <Toggle label="Check for a newer REcleaner" hint="Saved on this installation. REcleaner does not contact an update server." checked={settings.checkUpdates} onChange={(checkUpdates) => setSettings({ checkUpdates })} />
      </Group>
      <Group title="Diagnostics">
        <Toggle label="Show technical details" checked={settings.showTechnical} onChange={(showTechnical) => setSettings({ showTechnical })} />
        <Toggle label="Keep an operation log" checked={settings.diagnosticLogging} onChange={(diagnosticLogging) => setSettings({ diagnosticLogging })} />
      </Group>
      <Group title="Advanced">
        <p className="text-sm leading-6 text-muted">
          Current host: {platformLabel(profile.platform)}. Administrator: {profile.isAdmin ? "yes" : "no"}. Repair commands are defined per action and are not typed in from the screen.
        </p>
        <button type="button" className="mt-3 h-10 rounded-md border border-line px-3 text-sm" onClick={onRelaunch}>
          Restart as administrator
        </button>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-4">
      <h2 className="text-xs tracking-widest text-subtle">{title.toUpperCase()}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? <span className="mt-1 block text-xs leading-5 text-muted">{hint}</span> : null}
      </span>
      <input type="checkbox" className="mt-1 size-4 accent-current" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function RepairDialog({
  choices,
  restore,
  allowRestore,
  onChange,
  onRestore,
  onCancel,
  onStart,
}: {
  choices: RepairChoice[];
  restore: boolean;
  allowRestore: boolean;
  onChange: (choices: RepairChoice[]) => void;
  onRestore: (restore: boolean) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const heavy = choices.some((item) => item.selected && (item.actionId === "dism-smart" || item.actionId === "sfc-smart"));
  return (
    <SimpleDialog
      title="Recommended repair plan"
      body={heavy ? "Image or system-file repair often takes 10–40 minutes. There is no percent." : "Only the checked items will run. Nothing else is changed."}
      onCancel={onCancel}
    >
      <ul className="mb-4 max-h-64 space-y-3 overflow-y-auto text-left">
        {allowRestore ? (
          <li>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-current" checked={restore} onChange={(event) => onRestore(event.target.checked)} />
              <span>
                <span className="block">Create a restore point</span>
                <span className="mt-1 block text-xs leading-5 text-muted">Runs first. If it fails, the repairs do not start.</span>
              </span>
            </label>
          </li>
        ) : null}
        {choices.map((item) => (
          <li key={item.actionId}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-current"
                checked={item.selected}
                onChange={(event) => onChange(choices.map((choice) => (choice.actionId === item.actionId ? { ...choice, selected: event.target.checked } : choice)))}
              />
              <span>
                <span className="block">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                  {item.risk === "high" ? "High impact. " : item.risk === "moderate" ? "Moderate. " : ""}
                  {item.detail}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="h-11 rounded-md bg-paper px-4 text-sm font-medium text-paper-fg disabled:opacity-40" disabled={!choices.some((item) => item.selected)} onClick={onStart}>
        Review & repair
      </button>
      <button type="button" className="h-11 px-3 text-sm text-muted" onClick={onCancel}>
        Cancel
      </button>
    </SimpleDialog>
  );
}

function Welcome({ onScan, onSkip }: { onScan: () => void; onSkip: () => void }) {
  return (
    <SimpleDialog title="Welcome to REcleaner" body="Full system scan reads this PC. It does not repair anything until you approve a recommendation." onCancel={onSkip}>
      <button type="button" className="h-11 rounded-md bg-paper px-4 text-sm font-medium text-paper-fg" onClick={onScan}>
        Full system scan
      </button>
      <button type="button" className="h-11 px-3 text-sm text-muted" onClick={onSkip}>
        Skip
      </button>
    </SimpleDialog>
  );
}

function ConfirmDialog({
  tool,
  acknowledged,
  onAcknowledge,
  onCancel,
  onContinue,
}: {
  tool: Tool;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <SimpleDialog title={tool.title} body={tool.confirm ?? "Continue?"} onCancel={onCancel}>
      {tool.acknowledge ? (
        <label className="mb-3 flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} />
          I understand this can be difficult to undo.
        </label>
      ) : null}
      <DialogButton disabled={Boolean(tool.acknowledge) && !acknowledged} onClick={onContinue}>
        Continue
      </DialogButton>
    </SimpleDialog>
  );
}

function RestoreDialog({ onCreate, onSkip, onCancel }: { onCreate: () => void; onSkip: () => void; onCancel: () => void }) {
  return (
    <SimpleDialog title="Protect your system" body="Create a restore point before continuing. If it cannot be created, the repair does not start." onCancel={onCancel}>
      <DialogButton onClick={onCreate}>Create restore point</DialogButton>
      <button type="button" className="h-11 px-3 text-sm text-muted" onClick={onSkip}>
        Continue without one
      </button>
    </SimpleDialog>
  );
}

function ParamDialog({
  tool,
  params,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  tool: Tool;
  params: Record<string, string>;
  error?: string;
  onChange: (params: Record<string, string>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const plan = getPlan(tool.actionId);
  const fields = plan?.fields ?? [];
  return (
    <SimpleDialog title={tool.title} body={tool.summary} onCancel={onCancel}>
      <div className="mb-4 space-y-3">
        {fields.map((field) => (
          <Field key={field} field={field} value={params[field] ?? ""} onChange={(value) => onChange({ ...params, [field]: value })} />
        ))}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <DialogButton onClick={onSubmit}>Start</DialogButton>
    </SimpleDialog>
  );
}

function Field({ field, value, onChange }: { field: FieldKey; value: string; onChange: (value: string) => void }) {
  const meta = FIELD_META[field];
  if (meta.type === "choice" && meta.options) {
    return (
      <label className="block text-sm">
        <span className="text-muted">{meta.label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-fg">
          <option value="">Choose</option>
          {meta.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block text-sm">
      <span className="text-muted">{meta.label}</span>
      <input
        value={value}
        autoComplete="off"
        type={meta.type === "secret" ? "password" : "text"}
        inputMode={meta.type === "number" ? "numeric" : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={meta.hint}
        className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-fg outline-none placeholder:text-subtle"
      />
    </label>
  );
}

function DetailsDialog({
  result,
  tool,
  showTechnical,
  onClose,
  onRelaunch,
}: {
  result: ServerResult;
  tool: string;
  showTechnical: boolean;
  onClose: () => void;
  onRelaunch: () => void;
}) {
  return (
    <SimpleDialog title={tool} body={result.summary} onCancel={onClose}>
      <dl className="mb-4 space-y-2 text-sm">
        <Status k="Result" v={stateLabel(result.state)} />
        <Status k="Duration" v={formatDuration(result.durationMs)} />
        <Status k="Exit code" v={result.exitCode === null ? "Not run" : String(result.exitCode)} />
      </dl>
      {result.state === "requires_admin" ? (
        <button type="button" className="mb-3 h-10 rounded-md border border-line px-3 text-sm" onClick={onRelaunch}>
          Restart as administrator
        </button>
      ) : null}
      {showTechnical && result.commands.length > 0 ? (
        <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted">{result.commands.join("\n")}</pre>
      ) : null}
      {showTechnical && result.output ? (
        <pre className="mb-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted">{result.output}</pre>
      ) : null}
      <DialogButton onClick={onClose}>Close</DialogButton>
    </SimpleDialog>
  );
}

function SimpleDialog({ title, body, onCancel, children }: { title: string; body: string; onCancel: () => void; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 rounded-xl border border-line bg-elevated p-6">
          <Dialog.Title className="text-lg font-medium tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted">{body}</Dialog.Description>
          <div className="mt-6 flex flex-wrap items-center gap-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-11 rounded-md bg-paper px-4 text-sm font-medium text-paper-fg disabled:opacity-40">
      {children}
    </button>
  );
}
