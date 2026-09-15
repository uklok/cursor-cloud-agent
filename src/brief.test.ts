import { describe, expect, it } from "vitest";
import { composePrompt, proofFromRun } from "./brief.js";

describe("composePrompt", () => {
  it("wraps the user prompt with env rules", () => {
    const text = composePrompt("Fix issue 12", {
      type: "cloud",
      name: "UKLOK OS",
      workdirRule: "SSH clone to /tmp/<slug>",
      skillsPath: "~/.cursor/skills",
    });
    expect(text).toContain("UKLOK OS");
    expect(text).toContain("base");
    expect(text).toContain("SSH clone to /tmp/<slug>");
    expect(text).toContain("Fix issue 12");
  });
});

describe("proofFromRun", () => {
  it("collects PR URLs", () => {
    expect(
      proofFromRun({
        git: {
          branches: [
            { repoUrl: "github.com/acme/a", prUrl: "https://github.com/acme/a/pull/1" },
            { repoUrl: "github.com/acme/b" },
          ],
        },
      }).prUrls,
    ).toEqual(["https://github.com/acme/a/pull/1"]);
  });
});
