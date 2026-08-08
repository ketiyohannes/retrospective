import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { pluginName } from "../src/index.js";

test("exports the plugin identity", () => {
  assert.equal(pluginName, "retrospective");
});

test("provides SQLite with FTS5 support", () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("CREATE VIRTUAL TABLE knowledge_fts USING fts5(cue, content)");
    database
      .prepare("INSERT INTO knowledge_fts (cue, content) VALUES (?, ?)")
      .run("sqlite concurrent writes", "Use WAL mode and short transactions.");

    const match = database
      .prepare("SELECT content FROM knowledge_fts WHERE knowledge_fts MATCH ?")
      .get("concurrent") as { content: string } | undefined;

    assert.equal(match?.content, "Use WAL mode and short transactions.");
  } finally {
    database.close();
  }
});
