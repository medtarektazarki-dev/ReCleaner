import { createRoot } from "react-dom/client";
import { RecleanerApp } from "@/components/recleaner/app";
import type { HostProfile } from "@/lib/recleaner/types";
import "@/styles.css";

const fallback: HostProfile = {
  platform: "win32",
  release: "",
  arch: "x64",
  cpus: 0,
  cpuModel: "Reading…",
  totalMem: 0,
  freeMem: 0,
  uptime: 0,
  load1: 0,
  isWindows: true,
  isAdmin: false,
  readAt: new Date().toISOString(),
};

async function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  try {
    const initial = window.recleaner?.isDesktop ? await window.recleaner.host() : fallback;
    createRoot(root).render(<RecleanerApp initial={initial} />);
  } catch (error) {
    root.textContent = error instanceof Error ? error.message : "REcleaner could not start.";
  }
}

void boot();
