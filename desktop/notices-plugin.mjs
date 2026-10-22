import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PACKAGE_DIR = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;

/**
 * Writes THIRD_PARTY_LICENSES.txt next to the interface, listing every npm package that was compiled into
 * the bundle together with its own licence text. The bundle is minified and carries no licence comments, so
 * without this file the copyright and permission notices that MIT and ISC require would not ship.
 */
export function thirdPartyNotices() {
  return {
    name: "recleaner-third-party-notices",
    generateBundle(_options, bundle) {
      const roots = new Set();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules ?? {})) {
          const match = PACKAGE_DIR.exec(id.split("?")[0]);
          if (match) roots.add(match[1]);
        }
      }
      const entries = [...roots]
        .map((root) => {
          const meta = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
          const file = readdirSync(root).find((name) => /^licen[cs]e(\.(md|txt))?$/i.test(name));
          const text = file ? readFileSync(path.join(root, file), "utf8").trim() : null;
          return { name: meta.name, version: meta.version, license: typeof meta.license === "string" ? meta.license : "see package", text };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const body = entries
        .map((entry) => {
          const head = `${entry.name}@${entry.version} (${entry.license})`;
          return `${head}\n${"-".repeat(head.length)}\n${entry.text ?? "The package ships no licence file; the licence above is the one it declares."}`;
        })
        .join("\n\n\n");
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_LICENSES.txt",
        source: `REcleaner interface: third-party packages included in this build\n\n${body}\n`,
      });
    },
  };
}

