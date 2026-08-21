import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKnowledgeChanges,
  listCompletedToolEvents,
  openDatabase,
  projectScope,
} from "../src/index.js";
import {
  handlePostToolUse,
  handlePostToolUseFailure,
  handlePreToolUse,
  handleStop,
} from "../src/hooks/handlers.js";

test("pre and post hooks retrieve knowledge and persist outcomes", () => {
  const database = openDatabase(":memory:");

  try {
    applyKnowledgeChanges(database, "old-session", [
      {
        action: "add",
        scope: projectScope("/workspace/project"),
        cue: "typecheck command",
        content: "Run npm run typecheck before building.",
      },
    ]);

    const context = handlePreToolUse(database, {
      session_id: "session-1",
      cwd: "/workspace/project",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-1",
      tool_input: { command: "npm run typecheck" },
    });
    assert.match(
      context?.hookSpecificOutput.additionalContext ?? "",
      /Run npm run typecheck/,
    );

    handlePostToolUse(database, {
      session_id: "session-1",
      cwd: "/workspace/project",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-1",
      tool_input: { command: "npm run typecheck" },
      tool_response: { exit_code: 1, output: "type error" },
    });

    assert.equal(
      listCompletedToolEvents(database, "session-1")[0]?.outcome,
      "error",
    );
    assert.match(
      handleStop(database, {
        session_id: "session-1",
        cwd: "/workspace/project",
        hook_event_name: "Stop",
        stop_hook_active: false,
      })?.reason ?? "",
      /bundled retrospective skill/,
    );
  } finally {
    database.close();
  }
});

test("hooks ignore their own MCP tools and do not repeat a stop continuation", () => {
  const database = openDatabase(":memory:");

  try {
    const output = handlePreToolUse(database, {
      session_id: "session-1",
      cwd: "/workspace/project",
      hook_event_name: "PreToolUse",
      tool_name: "mcp__retrospective__apply_retrospective",
      tool_use_id: "tool-own",
      tool_input: {},
    });

    assert.equal(output, undefined);
    assert.equal(listCompletedToolEvents(database, "session-1").length, 0);
    assert.equal(
      handleStop(database, {
        session_id: "session-1",
        cwd: "/workspace/project",
        hook_event_name: "Stop",
        stop_hook_active: true,
      }),
      undefined,
    );
  } finally {
    database.close();
  }
});

test("Claude failure hook records top-level error details", () => {
  const database = openDatabase(":memory:");

  try {
    handlePostToolUseFailure(database, {
      session_id: "session-claude",
      cwd: "/workspace/project",
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_use_id: "tool-failure",
      tool_input: { command: "npm test" },
      error: "Command exited with status 1",
      duration_ms: 100,
    });

    const [event] = listCompletedToolEvents(database, "session-claude");
    assert.equal(event?.outcome, "error");
    assert.match(event?.result ?? "", /status 1/);
  } finally {
    database.close();
  }
});
