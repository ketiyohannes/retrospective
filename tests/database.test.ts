import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";

import {
  applyKnowledgeChanges,
  clearSessionToolEvents,
  completeToolEvent,
  getKnowledge,
  listCompletedToolEvents,
  openDatabase,
  projectScope,
  recordPendingToolEvent,
  resolveDatabasePath,
  searchKnowledge,
  searchScopes,
} from "../src/index.js";

test("resolves MCP storage from an installed plugin cache path", () => {
  const codexHome = resolve("test-codex-home");
  assert.equal(
    resolveDatabasePath(
      {},
      join(
        codexHome,
        "plugins",
        "cache",
        "personal",
        "retrospective",
        "0.1.0",
      ),
    ),
    join(
      codexHome,
      "plugins",
      "data",
      "retrospective-personal",
      "retrospective.sqlite3",
    ),
  );
});

test("uses host-provided persistent plugin data directories", () => {
  assert.equal(
    resolveDatabasePath({ CLAUDE_PLUGIN_DATA: "/claude/plugin-data" }),
    join("/claude/plugin-data", "retrospective.sqlite3"),
  );
  assert.equal(
    resolveDatabasePath({ PLUGIN_DATA: "/codex/plugin-data" }),
    join("/codex/plugin-data", "retrospective.sqlite3"),
  );
});

test("opens and migrates the complete schema", () => {
  const database = openDatabase(":memory:");

  try {
    const version = database.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    const tables = database
      .prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN ('knowledge', 'tool_events')
        ORDER BY name
      `)
      .all() as unknown as Array<{ name: string }>;

    assert.equal(version.user_version, 2);
    assert.deepEqual(
      tables.map(({ name }) => name),
      ["knowledge", "tool_events"],
    );
  } finally {
    database.close();
  }
});

test("searches active knowledge by scope and prioritizes session context", () => {
  const database = openDatabase(":memory:");
  const scopes = searchScopes("session-1", "/workspace/project");

  try {
    applyKnowledgeChanges(database, "source-1", [
      {
        action: "add",
        scope: "global",
        cue: "sqlite locking",
        content: "Use short SQLite transactions.",
      },
      {
        action: "add",
        scope: projectScope("/workspace/project"),
        cue: "sqlite locking",
        content: "This project uses WAL mode.",
      },
      {
        action: "add",
        scope: "session:session-1",
        cue: "sqlite locking",
        content: "This session is debugging a lock timeout.",
      },
    ]);

    const matches = searchKnowledge(database, "sqlite lock", scopes, 3);

    assert.deepEqual(
      matches.map(({ scope }) => scope),
      ["session:session-1", "project:/workspace/project", "global"],
    );
  } finally {
    database.close();
  }
});

test("replaces and retires knowledge transactionally", () => {
  const database = openDatabase(":memory:");

  try {
    const [added] = applyKnowledgeChanges(database, "session-a", [
      {
        action: "add",
        scope: "global",
        cue: "package manager",
        content: "Use npm.",
      },
    ]);
    assert.ok(added);

    const [replacement] = applyKnowledgeChanges(database, "session-b", [
      {
        action: "replace",
        id: added.id,
        cue: "package manager",
        content: "Use pnpm for this workflow.",
      },
    ]);
    assert.ok(replacement);
    assert.equal(getKnowledge(database, added.id)?.state, "superseded");
    assert.equal(getKnowledge(database, replacement.id)?.replacesId, added.id);

    applyKnowledgeChanges(database, "session-c", [
      { action: "retire", id: replacement.id },
    ]);
    assert.equal(getKnowledge(database, replacement.id)?.state, "retired");

    assert.throws(() =>
      applyKnowledgeChanges(database, "session-d", [
        {
          action: "add",
          scope: "global",
          cue: "will roll back",
          content: "This must not persist.",
        },
        { action: "retire", id: 999_999 },
      ]),
    );
    assert.equal(
      searchKnowledge(
        database,
        "will roll back",
        searchScopes("session-d", "/workspace/project"),
      ).length,
      0,
    );
  } finally {
    database.close();
  }
});

test("records and completes a tool event with one session outcome lookup", () => {
  const database = openDatabase(":memory:");

  try {
    recordPendingToolEvent(database, {
      toolUseId: "tool-1",
      sessionId: "session-1",
      scope: projectScope("/workspace/project"),
      toolName: "Bash",
      input: '{"command":"npm test"}',
    });
    assert.equal(
      completeToolEvent(database, "tool-1", "tests passed", "success"),
      true,
    );

    const events = listCompletedToolEvents(database, "session-1");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.outcome, "success");
    assert.equal(clearSessionToolEvents(database, "session-1"), 1);
    assert.equal(listCompletedToolEvents(database, "session-1").length, 0);
  } finally {
    database.close();
  }
});
