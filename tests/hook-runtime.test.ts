import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runtimeDirectory = fileURLToPath(
  new URL("../runtime/hooks/", import.meta.url),
);

test("bundled hook entrypoints capture a tool call and continue for retrospective", () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), "retrospective-hooks-"));
  const environment = {
    ...process.env,
    RETROSPECTIVE_DATA_DIR: dataDirectory,
  };

  try {
    const common = {
      session_id: "runtime-session",
      cwd: "/workspace/project",
      tool_name: "Bash",
      tool_use_id: "runtime-tool",
      tool_input: { command: "npm test" },
    };
    const pre = runHook("pre-tool-use.js", {
      ...common,
      hook_event_name: "PreToolUse",
    }, environment);
    assert.equal(pre.status, 0);
    assert.equal(pre.stdout, "");

    const post = runHook("post-tool-use.js", {
      ...common,
      hook_event_name: "PostToolUse",
      tool_response: { exit_code: 0, output: "passed" },
    }, environment);
    assert.equal(post.status, 0);
    assert.equal(post.stdout, "");

    const stop = runHook("stop.js", {
      session_id: "runtime-session",
      cwd: "/workspace/project",
      hook_event_name: "Stop",
      stop_hook_active: false,
    }, environment);
    assert.equal(stop.status, 0);
    assert.equal(JSON.parse(stop.stdout).decision, "block");
  } finally {
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

function runHook(
  filename: string,
  input: unknown,
  environment: NodeJS.ProcessEnv,
) {
  return spawnSync(
    process.execPath,
    ["--no-warnings", join(runtimeDirectory, filename)],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      env: environment,
    },
  );
}
