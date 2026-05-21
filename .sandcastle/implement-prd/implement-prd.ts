import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { z } from "zod";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

const PRD_NUMBER = required("PRD_NUMBER");
const PRD_TITLE = required("PRD_TITLE");
const SUB_ISSUE_NUMBER = required("SUB_ISSUE_NUMBER");
const SUB_ISSUE_TITLE = required("SUB_ISSUE_TITLE");
const BRANCH = required("BRANCH");
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/tmp";

const PromptOutput = z.object({
  prTitle: z.string().min(1).max(256),
  prDescription: z.string().min(1),
});

const result = await sandcastle.run({
  name: `implement-prd-#${PRD_NUMBER}-sub-#${SUB_ISSUE_NUMBER}`,
  agent: sandcastle.claudeCode("claude-opus-4-6", {
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN"),
    },
  }),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    PRD_NUMBER,
    PRD_TITLE,
    SUB_ISSUE_NUMBER,
    SUB_ISSUE_TITLE,
    BRANCH,
  },
  output: sandcastle.Output.object({
    tag: "output",
    schema: PromptOutput,
  }),
});

// Success is judged by whether the branch is ahead of main, not whether this
// particular run produced commits. A rerun over an already-completed sub-issue
// (where the prior run committed the work) should still pass.
const commitsAheadOfMain = Number(
  execSync("git rev-list --count origin/main..HEAD", {
    encoding: "utf8",
  }).trim()
);

if (commitsAheadOfMain === 0) {
  fail(
    `Branch has no commits ahead of \`main\` after implementing sub-issue #${SUB_ISSUE_NUMBER}.`
  );
}

fs.writeFileSync(path.join(OUTPUT_DIR, "pr_title.txt"), result.output.prTitle);
fs.writeFileSync(
  path.join(OUTPUT_DIR, "pr_description.txt"),
  result.output.prDescription
);

console.log(`\nWrote PR metadata to ${OUTPUT_DIR}`);
console.log(`  title: ${result.output.prTitle}`);
console.log(`  commits this run: ${result.commits.length}`);
console.log(`  commits ahead of main: ${commitsAheadOfMain}`);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "failure_reason.txt"), message);
  process.exit(1);
}
