import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile, copyFile, cp, stat } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = "/tmp/recleaner-stage";
const electronZip = "/tmp/electron-win.zip";
const electronUrl = "https://github.com/electron/electron/releases/download/v44.7.0/electron-v44.7.0-win32-x64.zip";
const go = existsSync("/tmp/sdk/go/bin/go") ? "/tmp/sdk/go/bin/go" : "go";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: root, ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function icons() {
  await mkdir(path.join(root, "desktop/build"), { recursive: true });
  const svg = await readFile(path.join(root, "desktop/brand/icon.svg"));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const size of sizes) {
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    buffers.push(png);
    await writeFile(path.join(root, "desktop/build", `icon-${size}.png`), png);
  }
  await writeFile(path.join(root, "desktop/build/icon.png"), buffers[buffers.length - 1]);
  await writeFile(path.join(root, "desktop/build/tray.png"), buffers[2]);
  const ico = await pngToIco(buffers);
  await writeFile(path.join(root, "desktop/build/REcleaner.ico"), ico);
  await mkdir(path.join(root, "artifacts"), { recursive: true });
  await writeFile(path.join(root, "artifacts/REcleaner.ico"), ico);
}

function stamp(exePath, icoPath, original) {
  const exe = NtExecutable.from(readFileSyncSafe(exePath));
  const res = NtExecutableResource.from(exe);
  const iconFile = Data.IconFile.from(readFileSyncSafe(icoPath));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const icons = iconFile.icons.map((item) => item.data);
  if (groups.length === 0) {
    Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);
  } else {
    for (const group of groups) {
      Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons);
    }
  }
  const versions = Resource.VersionInfo.fromEntries(res.entries);
  const strings = {
    FileDescription: "REcleaner",
    ProductName: "REcleaner",
    OriginalFilename: original,
    InternalName: "REcleaner",
    CompanyName: "REcleaner",
    LegalCopyright: "REcleaner",
    FileVersion: "1.0.0",
    ProductVersion: "1.0.0",
  };
  if (versions[0]) {
    versions[0].setStringValues({ lang: 1033, codepage: 1200 }, strings);
    versions[0].fixedInfo.fileVersionMS = 1 << 16;
    versions[0].fixedInfo.fileVersionLS = 0;
    versions[0].fixedInfo.productVersionMS = 1 << 16;
    versions[0].fixedInfo.productVersionLS = 0;
    versions[0].outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  return Buffer.from(exe.generate());
}

function readFileSyncSafe(file) {
  return readFileSync(file);
}

async function main() {
  console.log("icons");
  await icons();
  console.log("runner");
  await build({
    entryPoints: [path.join(root, "desktop/runner-entry.ts")],
    outfile: path.join(root, "desktop/build/runner.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    legalComments: "none",
  });
  const runner = await import(path.join(root, "desktop/build/runner.cjs"));
  const host = await runner.readHost();
  if (host.isWindows) throw new Error("build host unexpectedly reported Windows");
  const blocked = await runner.executeAction("dism-smart", {});
  if (blocked.state !== "unavailable") throw new Error(`expected unavailable, got ${blocked.state}`);
  const read = await runner.executeAction("host-read", {});
  if (read.state !== "success" || read.exitCode !== 0) throw new Error("host-read failed");
  const unknown = await runner.executeAction("not-a-tool", {});
  if (unknown.state !== "error") throw new Error("unknown action should error");
  console.log("runner ok", { blocked: blocked.state, read: read.summary });

  console.log("ui");
  await run("node", [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.desktop.config.ts"]);
  const html = await readFile(path.join(root, "desktop/build/ui/index.html"), "utf8");
  if (!html.includes("REcleaner")) throw new Error("desktop ui title missing");
  const assets = path.join(root, "desktop/build/ui/assets");
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(assets);
  const js = files.find((name) => name.endsWith(".js"));
  const css = files.find((name) => name.endsWith(".css"));
  if (!js || !css) throw new Error(`ui assets missing: ${files.join(",")}`);
  const jsText = await readFile(path.join(assets, js), "utf8");
  if (jsText.includes("WindowsRepairToolPro") || jsText.includes("runner.server")) {
    throw new Error("desktop bundle leaked the legacy script or server runner");
  }
  const cssText = await readFile(path.join(assets, css), "utf8");
  if (!cssText.includes("#07111c") && !cssText.includes("7,17,28")) throw new Error("desktop css missing the navy surface");

  console.log("stage");
  if (!existsSync(electronZip)) {
    console.log("downloading Electron Windows runtime");
    await run("curl", ["-fL", "--retry", "3", "-o", electronZip, electronUrl]);
  }
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await run("unzip", ["-q", electronZip, "-d", stage]);
  await rm(path.join(stage, "resources/default_app.asar"), { force: true });
  const appDir = path.join(stage, "resources/app");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "recleaner", productName: "REcleaner", version: "1.0.0", private: true, main: "main.cjs" }, null, 2),
  );
  await copyFile(path.join(root, "desktop/main.cjs"), path.join(appDir, "main.cjs"));
  await copyFile(path.join(root, "desktop/preload.cjs"), path.join(appDir, "preload.cjs"));
  await copyFile(path.join(root, "desktop/build/runner.cjs"), path.join(appDir, "runner.cjs"));
  await copyFile(path.join(root, "desktop/build/icon.png"), path.join(appDir, "icon.png"));
  await copyFile(path.join(root, "desktop/build/tray.png"), path.join(appDir, "tray.png"));
  await cp(path.join(root, "desktop/build/ui"), path.join(appDir, "ui"), { recursive: true });
  await run(go, ["build", "-ldflags", "-s -w -H windowsgui", "-o", path.join(stage, "Uninstall.exe"), "."], {
    cwd: path.join(root, "desktop/installer/uninstall"),
    env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
  });

  const exePath = path.join(stage, "REcleaner.exe");
  await run("mv", [path.join(stage, "electron.exe"), exePath]);
  const ico = path.join(root, "desktop/build/REcleaner.ico");
  await writeFile(exePath, stamp(exePath, ico, "REcleaner.exe"));
  await writeFile(path.join(stage, "Uninstall.exe"), stamp(path.join(stage, "Uninstall.exe"), ico, "Uninstall.exe"));

  const stamped = NtExecutableResource.from(NtExecutable.from(readFileSyncSafe(exePath)));
  const after = Resource.IconGroupEntry.fromEntries(stamped.entries);
  const count = after[0]?.icons?.length ?? 0;
  if (count < 7) throw new Error(`icon group has ${count} images`);
  const version = Resource.VersionInfo.fromEntries(stamped.entries)[0];
  const values = version?.getStringValues({ lang: 1033, codepage: 1200 }) ?? {};
  if (values.ProductName !== "REcleaner" || values.OriginalFilename !== "REcleaner.exe") {
    throw new Error(`version resource mismatch ${JSON.stringify(values)}`);
  }
  const head = (await readFile(exePath)).subarray(0, 2).toString("latin1");
  if (head !== "MZ") throw new Error("REcleaner.exe is not a PE");

  console.log("zip");
  const payload = "/tmp/recleaner-payload.zip";
  await run("python3", ["-c", `
import os, zipfile
root = ${JSON.stringify(stage)}
dest = ${JSON.stringify(payload)}
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for dirpath, _, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace("\\\\", "/")
            z.write(full, rel)
print("zipped", os.path.getsize(dest))
`]);
  await copyFile(payload, path.join(root, "artifacts/REcleaner-win64.zip"));

  console.log("setup");
  const stub = "/tmp/recleaner-setup-stub.exe";
  await run(go, ["build", "-ldflags", "-s -w -H windowsgui", "-o", stub, "."], {
    cwd: path.join(root, "desktop/installer/setup"),
    env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
  });
  await writeFile(stub, stamp(stub, ico, "REcleaner Setup.exe"));
  const setupPath = path.join(root, "artifacts/REcleaner Setup.exe");
  const stubBuf = await readFile(stub);
  const zipBuf = await readFile(payload);
  const offset = Buffer.alloc(8);
  offset.writeBigUInt64LE(BigInt(stubBuf.length));
  await writeFile(setupPath, Buffer.concat([stubBuf, zipBuf, offset]));
  const setupHead = (await readFile(setupPath)).subarray(0, 2).toString("latin1");
  if (setupHead !== "MZ") throw new Error("setup is not a PE");
  const setupStat = await stat(setupPath);
  const exeStat = await stat(exePath);
  console.log(JSON.stringify({ exe: exeStat.size, setup: setupStat.size, icons: count, product: values.ProductName }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
