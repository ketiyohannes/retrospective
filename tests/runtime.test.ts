import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { pluginName } from "../src/index.js";

test("exports the plugin identity", () => {
  assert.equal(pluginName, "retrospective");
});

test("provides the built-in SQLite runtime", () => {
  const database = new DatabaseSync(":memory:");

  try {
    const row = database.prepare("SELECT sqlite_version() AS version").get() as {
      version: string;
    };
    assert.match(row.version, /^3\./);
  } finally {
    database.close();
  }
});
