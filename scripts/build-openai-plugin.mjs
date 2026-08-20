import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(repositoryRoot, "plugins/openai/nutty/mcp");
const outputFile = resolve(outputDirectory, "server.mjs");

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [resolve(repositoryRoot, "apps/mcp-server/src/stdio.ts")],
  outfile: outputFile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "bundle",
  sourcemap: false,
  legalComments: "none",
});

const bundle = await readFile(outputFile, "utf8");
await writeFile(outputFile, bundle.replace(/[ \t]+$/gm, ""), "utf8");
