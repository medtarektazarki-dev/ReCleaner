import { create } from "zustand";
import type { LogEntry, RunState, ServerResult, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  density: "comfortable",
  launchWithWindows: false,
  runMinimized: false,
  checkUpdates: false,
  restoreBeforeRepair: true,
  showTechnical: true,
  diagnosticLogging: true,
  notifications: false,
};

const SETTINGS_KEY = "recleaner.settings.v1";
const LOG_KEY = "recleaner.log.v1";
const WELCOME_KEY = "recleaner.welcome.v1";

type Store = {
  settings: Settings;
  welcomeDone: boolean;
  hydrated: boolean;
  states: Record<string, RunState>;
  results: Record<string, ServerResult>;
  log: LogEntry[];
  hydrate: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  finishWelcome: () => void;
  setToolState: (toolId: string, state: RunState) => void;
  record: (toolId: string, tool: string, result: ServerResult) => void;
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useRecleaner = create<Store>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  welcomeDone: true,
  hydrated: false,
  states: {},
  results: {},
  log: [],
  hydrate: () => {
    const settings = loadSettings();
    let log: LogEntry[] = [];
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (raw) log = JSON.parse(raw) as LogEntry[];
    } catch {
      log = [];
    }
    set({
      settings,
      log: Array.isArray(log) ? log.slice(0, 40) : [],
      welcomeDone: localStorage.getItem(WELCOME_KEY) === "1",
      hydrated: true,
    });
  },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },
  finishWelcome: () => {
    localStorage.setItem(WELCOME_KEY, "1");
    set({ welcomeDone: true });
  },
  setToolState: (toolId, state) => set((current) => ({ states: { ...current.states, [toolId]: state } })),
  record: (toolId, tool, result) => {
    const settings = get().settings;
    const stored: ServerResult = settings.diagnosticLogging ? result : { ...result, output: "" };
    const entry: LogEntry = { ...stored, id: `${result.startedAt}-${toolId}`, tool };
    const log = [entry, ...get().log].slice(0, 40);
    if (settings.diagnosticLogging) localStorage.setItem(LOG_KEY, JSON.stringify(log));
    set((current) => ({
      log,
      results: { ...current.results, [toolId]: stored },
      states: { ...current.states, [toolId]: result.state },
    }));
  },
}));
