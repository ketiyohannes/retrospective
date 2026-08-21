import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKnowledgeChanges,
  applyRetrospective,
  getRetrospectiveContext,
  listCompletedToolEvents,
  openDatabase,
  projectScope,
  recordPendingToolEvent,
  completeToolEvent,
} from "../src/index.js";

test("loads the latest session evidence with related knowledge", () => {
  const database = openDatabase(":memory:");
  const scope = projectScope("/workspace/project");

  try {
    applyKnowledgeChanges(database, "older-session", [
      {
        action: "add",
        scope,
        cue: "typescript typecheck",
        content: "Run the TypeScript typecheck before packaging.",
      },
    ]);
    recordPendingToolEvent(database, {
      toolUseId: "tool-latest",
      sessionId: "latest-session",
      scope,
      toolName: "Bash",
      input: "npm run typecheck",
    });
    completeToolEvent(
      database,
      "tool-latest",
      "TypeScript typecheck passed",
      "success",
    );

    const context = getRetrospectiveContext(database);

    assert.equal(context.sessionId, "latest-session");
    assert.equal(context.events.length, 1);
    assert.equal(context.relatedKnowledge[0]?.cue, "typescript typecheck");
  } finally {
    database.close();
  }
});

test("applies knowledge and clears evidence in one retrospective", () => {
  const database = openDatabase(":memory:");
  const scope = projectScope("/workspace/project");

  try {
    recordPendingToolEvent(database, {
      toolUseId: "tool-1",
      sessionId: "session-1",
      scope,
      toolName: "Bash",
      input: "npm test",
    });
    completeToolEvent(database, "tool-1", "passed", "success");

    const result = applyRetrospective(database, "session-1", [
      {
        action: "add",
        scope,
        cue: "verification order",
        content: "Run focused tests before the complete suite.",
      },
    ]);

    assert.equal(result.applied.length, 1);
    assert.equal(result.clearedEvents, 1);
    assert.equal(listCompletedToolEvents(database, "session-1").length, 0);
  } finally {
    database.close();
  }
});
