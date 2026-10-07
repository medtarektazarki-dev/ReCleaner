import type { HostProfile, ServerResult, Settings } from "./types";

export type DesktopApi = {
  isDesktop: true;
  host: () => Promise<HostProfile>;
  run: (actionId: string, params: Record<string, string>) => Promise<ServerResult>;
  applySettings: (settings: Settings) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
};

declare global {
  interface Window {
    recleaner?: DesktopApi;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && window.recleaner?.isDesktop === true;
}
