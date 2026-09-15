import { inferEnvRole } from "./registry.js";
import type { EnvRecord } from "./types.js";

export function composePrompt(userPrompt: string, record: EnvRecord, omittedRepo?: string): string {
  const role = inferEnvRole(record);
  const lines = [
    "You are the senior implementer on a Cursor Cloud saved environment.",
    `Environment: ${record.name} (${record.type}, ${role})`,
  ];
  if (role === "base") {
    lines.push(
      "This is a base environment. Clone the target into the workdir when it is not already present.",
    );
  } else {
    lines.push(
      "This environment is prepared for a loaded project repo. Prefer the existing workspace.",
    );
  }
  if (omittedRepo) {
    lines.push(`Target repo (already on this env; do not expect a second clone from launch): ${omittedRepo}`);
  }
  if (record.workdirRule) {
    lines.push(`Workdir: ${record.workdirRule}`);
  }
  if (record.skillsPath) {
    lines.push(`Org skills: ${record.skillsPath}`);
  }
  if (record.note) {
    lines.push(record.note);
  }
  lines.push(
    "Do not invent secrets. Prefer the existing workspace. Follow-ups will reuse this agent.",
    "",
    "---",
    "",
    userPrompt.trim(),
  );
  return lines.join("\n");
}

export function proofFromRun(run: {
  result?: string;
  durationMs?: number;
  git?: { branches?: Array<{ repoUrl?: string; branch?: string; prUrl?: string }> };
}): {
  prUrls: string[];
  branches: Array<{ repoUrl?: string; branch?: string; prUrl?: string }>;
  result?: string;
  durationMs?: number;
} {
  const branches = run.git?.branches ?? [];
  return {
    prUrls: branches.map((branch) => branch.prUrl).filter((url): url is string => Boolean(url)),
    branches,
    result: run.result,
    durationMs: run.durationMs,
  };
}
