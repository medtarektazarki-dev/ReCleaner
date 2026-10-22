// Drives the built desktop interface (desktop/build/ui) in Chromium against a scripted stand-in for the
// Electron bridge. It checks what the user sees and which actions the interface asks the bridge to run.
// It cannot show that Windows accepted a command: nothing here executes a Windows program.
//
//   npm run test:ui
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page_url = pathToFileURL(path.join(root, "desktop/build/ui/index.html")).href;
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const outDir = path.join(root, "artifacts/ui-smoke");
mkdirSync(outDir, { recursive: true });

const HOST = {
  platform: "win32", release: "10.0.22631", arch: "x64", cpus: 8, cpuModel: "Test CPU", totalMem: 16 * 2 ** 30,
  freeMem: 9 * 2 ** 30, uptime: 3600, load1: 0, isWindows: true, isAdmin: true, readAt: new Date().toISOString(),
};

/** Runs in the page before the interface starts. Everything the bridge does is recorded in window.__calls. */
function installBridge({ host, delayMs }) {
  const calls = [];
  window.__calls = calls;
  window.__overrides = {};
  const grade = (g, summary, extra = "") => `GRADE=${g}\nSUMMARY=${summary}\n${extra}`;
  const outputs = {
    "win-info": "PRODUCT=Windows 11 Pro\nBUILD=22631\nWINDOWS11=yes\n" + grade("healthy", "Windows 11 Pro build 22631."),
    "host-read": `platform=win32\ntotal=${16 * 2 ** 30}\nfree=${9 * 2 ** 30}\nadmin=true`,
    "dism-check": grade("warning", "The component store is repairable. RestoreHealth was not started.", "REPAIR=dism-smart"),
    "sfc-verify": grade("healthy", "System File Checker reported no remaining integrity violations."),
    "wu-diagnose": grade("healthy", "Update services responded."),
    "defender-status": grade("unknown", "Microsoft Defender is in passive mode."),
    "firewall-status": grade("healthy", "Reported firewall profiles are on."),
    "disk-diagnose": grade("attention", "Temporary files were measured.", "TEMP_BYTES=900000000\nREPAIR=clean-temp"),
    "network-diagnose": grade("healthy", "HTTPS to www.microsoft.com succeeded."),
    "services-diagnostic": grade("healthy", "Services are fine."),
    "winget-diagnose": grade("healthy", "WinGet responded."),
    "events-diagnose": grade("healthy", "No critical events."),
    "bsod-diagnose": grade("healthy", "No crash evidence."),
    "wmi-diagnose": grade("healthy", "WMI repository is consistent."),
    "shell-diagnose": grade("healthy", "Explorer is running."),
    "startup-diagnose": grade("healthy", "Startup commands were listed."),
  };
  const result = (actionId, state, summary, output = "") => ({
    actionId, title: actionId, state, summary, exitCode: state === "success" ? 0 : 1, durationMs: 5,
    output, startedAt: new Date().toISOString(), commands: [`${actionId} (scripted)`], isWindows: true,
  });
  window.recleaner = {
    isDesktop: true,
    host: async () => ({ ...host, readAt: new Date().toISOString() }),
    run: async (actionId, params) => {
      calls.push({ actionId, params });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const override = window.__overrides[actionId];
      if (override === "throw") throw new Error("ipc rejected");
      if (override) return result(actionId, override.state, override.summary, override.output ?? "");
      if (outputs[actionId]) return result(actionId, "success", "ok", outputs[actionId]);
      return result(actionId, "success", `${actionId} finished.`, "");
    },
    applySettings: async () => undefined,
    notify: async () => undefined,
    window: {
      minimize: async () => calls.push({ actionId: "window:minimize" }),
      toggleMaximize: async () => calls.push({ actionId: "window:maximize" }),
      close: async () => calls.push({ actionId: "window:close" }),
    },
  };
}

const failures = [];
const passes = [];
async function check(name, fn) {
  try {
    await fn();
    passes.push(name);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push({ name, message: String(error?.message ?? error).split("\n")[0] });
    console.log(`FAIL ${name}\n     ${String(error?.message ?? error).split("\n")[0]}`);
  }
}

async function open(browser, { host = HOST, delayMs = 0, reducedMotion = "no-preference", viewport = { width: 1280, height: 800 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
  await page.addInitScript(installBridge, { host, delayMs });
  await page.goto(page_url);
  await page.waitForSelector("nav[aria-label='Sections']", { timeout: 10000 });
  return { page, context, problems };
}

const calls = (page) => page.evaluate(() => window.__calls.map((c) => c.actionId));
const nav = (page, label) => page.locator("nav[aria-label='Sections'] button", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
const row = (page, title) => page.locator("li", { has: page.locator("h2", { hasText: new RegExp(`^${title}$`) }) });
const skipWelcome = async (page) => {
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
};

// Set RECLEANER_CHROMIUM to use an existing Chromium when Playwright's own browser download is not installed.
// Electron loads the bundled page from file:// without Chromium's cross-origin check for module scripts;
// plain Chromium needs this flag to behave the same way.
const browser = await chromium.launch({
  executablePath: process.env.RECLEANER_CHROMIUM || undefined,
  args: ["--allow-file-access-from-files"],
});
try {
  // ---------- boot, navigation, version ----------
  {
    const { page, context, problems } = await open(browser);
    await check("opens from file:// with no console errors, page errors or failed requests", async () => {
      await page.waitForSelector("text=Welcome to REcleaner");
      assert.deepEqual(problems, []);
    });
    await check("shows the package.json version in the header", async () => {
      assert.ok(await page.getByText(`v${version}`, { exact: true }).first().isVisible());
    });
    await skipWelcome(page);
    const sections = ["Optimize", "Disk", "Repair", "Security", "Advanced", "Drivers", "Apps", "Maintenance", "Accounts", "Tweaks", "Licensing"];
    for (const label of sections) {
      await check(`section ${label} lists tools with working Run buttons`, async () => {
        await nav(page, label);
        await page.waitForSelector(`h1:text-is("${label}")`);
        assert.ok((await page.getByRole("button", { name: "Run", exact: true }).count()) > 0);
      });
    }
    await check("Activity and Settings render, Settings shows the version", async () => {
      await nav(page, "Activity");
      await page.waitForSelector("h1:text-is('Activity')");
      await nav(page, "Settings");
      await page.waitForSelector(`text=REcleaner v${version}`);
    });
    await check("tool search finds a tool and opens its section", async () => {
      await page.getByLabel("Search tools").fill("firewall");
      await page.waitForSelector("h1:text-is('Search')");
      await page.getByRole("button", { name: /Reset firewall/ }).click();
      await page.waitForSelector("h1:text-is('Security')");
    });
    await check("no errors accumulated while navigating", async () => assert.deepEqual(problems, []));
    await context.close();
  }

  // ---------- confirmation and parameter boundaries ----------
  {
    const { page, context } = await open(browser);
    await skipWelcome(page);
    await check("a high-risk action needs an explicit acknowledgement and does nothing when cancelled", async () => {
      await nav(page, "Advanced");
      await row(page, "Disable Windows Update").getByRole("button", { name: "Run" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.ok(await dialog.getByRole("button", { name: "Continue" }).isDisabled());
      await dialog.getByRole("checkbox").check();
      assert.ok(await dialog.getByRole("button", { name: "Continue" }).isEnabled());
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.ok(!(await calls(page)).includes("disable-updates"), "the action ran after cancel");
    });
    await check("a password that starts with / is refused in the dialog and never reaches the bridge", async () => {
      await nav(page, "Accounts");
      await row(page, "Change password").getByRole("button", { name: "Run" }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("checkbox").check();
      await dialog.getByRole("button", { name: "Continue" }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Username").fill("bob");
      await dialog.getByLabel("Password").fill("/delete");
      await dialog.getByRole("button", { name: "Start" }).click();
      await dialog.getByText("A password cannot start with / or *.").waitFor();
      assert.ok(!(await calls(page)).includes("user-password"));
      await dialog.getByLabel("Password").fill("Good-pass1");
      await dialog.getByRole("button", { name: "Start" }).click();
      await page.waitForFunction(() => window.__calls.some((c) => c.actionId === "user-password"));
      const sent = await page.evaluate(() => window.__calls.find((c) => c.actionId === "user-password").params);
      assert.deepEqual(sent, { user: "bob", password: "Good-pass1" });
    });
    await check("the password is never stored in the activity log", async () => {
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      assert.ok(!stored.includes("Good-pass1"));
    });
    await check("a bridge failure ends as an error result and the interface recovers", async () => {
      await page.evaluate(() => (window.__overrides["dns-cloudflare"] = "throw"));
      await nav(page, "Advanced");
      const tool = row(page, "Cloudflare DNS");
      await tool.getByRole("button", { name: "Run" }).click();
      await tool.getByText("Error", { exact: true }).waitFor();
      assert.equal(await page.getByText("Running…").count(), 0);
      assert.ok(await tool.getByRole("button", { name: "Run" }).isEnabled());
    });
    await context.close();
  }

  // ---------- full scan, recommendations, repair chain ----------
  {
    const { page, context, problems } = await open(browser);
    await skipWelcome(page);
    await check("full system scan runs every check, recommends only what the findings support, and repairs nothing", async () => {
      await page.getByRole("button", { name: "Full system scan" }).click();
      await page.getByRole("button", { name: "Scan again" }).waitFor({ timeout: 20000 });
      const ran = await calls(page);
      for (const id of ["win-info", "host-read", "dism-check", "sfc-verify", "wu-diagnose", "defender-status", "firewall-status", "disk-diagnose", "network-diagnose", "services-diagnostic", "winget-diagnose", "events-diagnose", "bsod-diagnose", "wmi-diagnose", "shell-diagnose", "startup-diagnose"]) {
        assert.ok(ran.includes(id), `scan skipped ${id}`);
      }
      for (const forbidden of ["dism-smart", "sfc-smart", "clean-temp", "wu-repair", "restore-point"]) {
        assert.ok(!ran.includes(forbidden), `scan started ${forbidden}`);
      }
      await page.screenshot({ path: path.join(outDir, "scan-complete.png") });
    });
    await check("an unreadable check is shown as Unknown, not as healthy", async () => {
      const text = await page.locator("body").innerText();
      assert.match(text, /Unknown/i);
    });
    await check("a restore point that Windows declines stops the repairs that depend on it", async () => {
      await page.evaluate(() => (window.__overrides["restore-point"] = { state: "warning", summary: "Windows did not create a new restore point." }));
      const before = (await calls(page)).length;
      await page.getByRole("button", { name: "Review & repair" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Repair the component store").waitFor();
      const restore = dialog.getByRole("checkbox").first();
      if (!(await restore.isChecked())) await restore.check();
      await dialog.getByRole("button", { name: "Review & repair" }).click();
      await page.waitForFunction((n) => window.__calls.length > n, before);
      await page.getByText("Stopped because the restore point or administrator check did not succeed.").first().waitFor({ timeout: 20000 });
      const after = (await calls(page)).slice(before);
      assert.ok(after.includes("restore-point"));
      assert.ok(!after.includes("dism-smart"), "DISM repair ran without a restore point");
      assert.ok(!after.includes("clean-temp"));
    });
    await check("no errors during the scan and repair flow", async () => assert.deepEqual(problems, []));
    await context.close();
  }

  // ---------- close dialog is truthful ----------
  {
    const { page, context } = await open(browser, { delayMs: 600 });
    await skipWelcome(page);
    await check("closing while idle says nothing is running", async () => {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByText("Nothing is left running.").waitFor();
      await page.keyboard.press("Escape");
    });
    await check("closing during a scan warns that started Windows tools can keep running", async () => {
      await page.getByRole("button", { name: "Full system scan" }).click();
      await page.getByRole("button", { name: "Cancel scan" }).waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByText(/A task is still running/).waitFor();
      assert.equal(await page.getByText("Nothing is left running.").count(), 0);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Cancel scan" }).click();
      await page.getByText(/Stopping after the current check/).waitFor();
    });
    await context.close();
  }

  // ---------- accessibility and reduced motion ----------
  {
    const { page, context, problems } = await open(browser, { reducedMotion: "reduce", viewport: { width: 1024, height: 680 } });
    await skipWelcome(page);
    await check("with reduced motion the splash is gone immediately and the minimum window has no horizontal overflow", async () => {
      assert.equal(await page.locator(".recleaner-splash").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    });
    await check("the keyboard reaches controls and shows a visible focus indicator", async () => {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        const style = el ? getComputedStyle(el) : null;
        return { tag: el?.tagName, outline: style?.outlineStyle, shadow: style?.boxShadow };
      });
      assert.ok(["BUTTON", "INPUT", "A"].includes(focus.tag), `focus landed on ${focus.tag}`);
      assert.ok(focus.outline !== "none" || (focus.shadow && focus.shadow !== "none"), "focused control has no visible indicator");
    });
    await check("no errors with reduced motion", async () => assert.deepEqual(problems, []));
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ version, passes, failures }, null, 2));
console.log(`\n${passes.length} passed, ${failures.length} failed. Report: artifacts/ui-smoke/report.json`);
if (failures.length > 0) process.exit(1);
