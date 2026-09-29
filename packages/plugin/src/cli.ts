#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatError } from "cursor-cloud-core";
import { setupGateway } from "./setup.js";
import { VERSION } from "./version.js";

async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv.find((token) => !token.startsWith("-")) ?? "";
  if (!command || command === "help" || argv.includes("--help")) {
    process.stdout.write(
      `openclaw-cursor-cloud ${VERSION}

Commands:
  setup    [--source link|npm|skip]
  mcp      (delegates to cursor-cloud-mcp)
  *        other commands delegate to cursor-cloud

`,
    );
    return;
  }
  if (command === "version" || argv.includes("--version")) {
    console.log(VERSION);
    return;
  }
  if (command === "setup") {
    const sourceFlag = readFlag(argv, "source");
    const source = sourceFlag === "link" || sourceFlag === "npm" || sourceFlag === "skip" ? sourceFlag : undefined;
    process.stdout.write(`${JSON.stringify(await setupGateway({ source }), null, 2)}\n`);
    return;
  }
  const target = command === "mcp" ? "cursor-cloud-mcp/cli" : "cursor-cloud-core/cli";
  const cli = fileURLToPath(import.meta.resolve(target));
  const child = spawn(process.execPath, [cli, ...argv], { stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
      resolve();
    });
  });
}

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.findIndex((token) => token === `--${name}` || token.startsWith(`--${name}=`));
  if (idx === -1) {
    return undefined;
  }
  const token = argv[idx];
  if (token.includes("=")) {
    return token.split("=", 2)[1];
  }
  const next = argv[idx + 1];
  return next && !next.startsWith("-") ? next : undefined;
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
  process.exitCode = 1;
});
