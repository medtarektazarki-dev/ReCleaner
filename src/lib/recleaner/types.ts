export type SectionId =
  | "overview"
  | "optimize"
  | "disk"
  | "repair"
  | "security"
  | "advanced"
  | "drivers"
  | "apps"
  | "maintenance"
  | "accounts"
  | "tweaks"
  | "licensing"
  | "activity"
  | "settings";

export type Risk = "safe" | "low" | "moderate" | "high";

export type RunState =
  | "ready"
  | "running"
  | "success"
  | "warning"
  | "error"
  | "cancelled"
  | "requires_admin"
  | "unavailable";

export type ResultState = Exclude<RunState, "ready" | "running">;

export type HostProfile = {
  platform: string;
  release: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMem: number;
  freeMem: number;
  uptime: number;
  load1: number;
  isWindows: boolean;
  isAdmin: boolean;
  readAt: string;
};

export type ServerResult = {
  actionId: string;
  title: string;
  state: ResultState;
  summary: string;
  exitCode: number | null;
  durationMs: number;
  output: string;
  startedAt: string;
  commands: string[];
  isWindows: boolean;
};

export type LogEntry = ServerResult & {
  id: string;
  tool: string;
};

export type Settings = {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  launchWithWindows: boolean;
  runMinimized: boolean;
  checkUpdates: boolean;
  restoreBeforeRepair: boolean;
  showTechnical: boolean;
  diagnosticLogging: boolean;
  notifications: boolean;
};

export type Tool = {
  id: string;
  section: Exclude<SectionId, "overview" | "activity" | "settings">;
  title: string;
  summary: string;
  risk: Risk;
  restorePoint?: boolean;
  confirm?: string;
  acknowledge?: boolean;
  actionId: string;
  suite?: "quick";
};
