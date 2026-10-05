// Explicit test preparation; never invoked by the application or build.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const commit = "0157797478ac27c8339444b604caaefd9e22dc95";
const dir = mkdtempSync(join(tmpdir(), "vertice-b2b-historical-"));
const archive = join(dir, "checkpoint.tar");
writeFileSync(
  archive,
  execFileSync("git", ["archive", "--format=tar", commit], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  }),
);
execFileSync("tar", ["-xf", archive, "-C", dir]);
if (process.platform === "win32")
  execFileSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", "npm.cmd ci --no-audit --no-fund"],
    { cwd: dir, stdio: "inherit" },
  );
else
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: dir,
    stdio: "inherit",
  });
const { build } = await import(
  pathToFileURL(join(dir, "node_modules/vite/dist/node/index.js")).href
);
const result = await build({
  root: dir,
  configFile: false,
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    lib: {
      entry: join(dir, "tests/helpers/repositoryHarness.ts"),
      name: "financeAudit",
      formats: ["iife"],
    },
  },
});
const output = Array.isArray(result) ? result[0] : result;
const code = output.output.find((item) => item.type === "chunk").code;
writeFileSync(join(dir, "old-writer.js"), code);
if (process.platform === "win32")
  execFileSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", "npm.cmd run build"],
    { cwd: dir, stdio: "inherit" },
  );
else execFileSync("npm", ["run", "build"], { cwd: dir, stdio: "inherit" });
const sha = (value) => createHash("sha256").update(value).digest("hex");
const evidence = {
  commit,
  lockfileSHA256: sha(readFileSync(join(dir, "package-lock.json"))),
  bundleSHA256: sha(code),
};
writeFileSync(
  join(dir, "artifact-evidence.json"),
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify({ B2B_OLD_ARTIFACT: dir, ...evidence }, null, 2));
