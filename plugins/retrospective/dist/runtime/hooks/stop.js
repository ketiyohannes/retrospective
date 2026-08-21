// src/database/database.ts
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/database/schema.ts
var KNOWLEDGE_SCHEMA_VERSION = 1;
var TOOL_EVENTS_SCHEMA_VERSION = 2;

// src/database/migrations/001-create-knowledge.ts
var createKnowledgeSchema = {
  version: KNOWLEDGE_SCHEMA_VERSION,
  sql: `
    CREATE TABLE knowledge (
      id INTEGER PRIMARY KEY,
      source_session_id TEXT NOT NULL CHECK (
        length(trim(source_session_id)) > 0
      ),
      scope TEXT NOT NULL CHECK (
        scope = 'global'
        OR (scope GLOB 'project:*' AND length(scope) > length('project:'))
        OR (scope GLOB 'session:*' AND length(scope) > length('session:'))
      ),
      cue TEXT NOT NULL CHECK (length(trim(cue)) > 0),
      content TEXT NOT NULL CHECK (length(trim(content)) > 0),
      state TEXT NOT NULL DEFAULT 'active' CHECK (
        state IN ('active', 'superseded', 'retired')
      ),
      replaces_id INTEGER REFERENCES knowledge(id),
      CHECK (replaces_id IS NULL OR replaces_id <> id)
    ) STRICT;

    CREATE INDEX knowledge_state_scope_idx
      ON knowledge (state, scope);

    CREATE INDEX knowledge_replaces_id_idx
      ON knowledge (replaces_id)
      WHERE replaces_id IS NOT NULL;

    CREATE VIRTUAL TABLE knowledge_fts USING fts5(
      cue,
      content,
      content = 'knowledge',
      content_rowid = 'id',
      tokenize = 'unicode61'
    );

    CREATE TRIGGER knowledge_after_insert
    AFTER INSERT ON knowledge
    BEGIN
      INSERT INTO knowledge_fts (rowid, cue, content)
      VALUES (new.id, new.cue, new.content);
    END;

    CREATE TRIGGER knowledge_after_delete
    AFTER DELETE ON knowledge
    BEGIN
      INSERT INTO knowledge_fts (knowledge_fts, rowid, cue, content)
      VALUES ('delete', old.id, old.cue, old.content);
    END;

    CREATE TRIGGER knowledge_after_update
    AFTER UPDATE OF cue, content ON knowledge
    BEGIN
      INSERT INTO knowledge_fts (knowledge_fts, rowid, cue, content)
      VALUES ('delete', old.id, old.cue, old.content);

      INSERT INTO knowledge_fts (rowid, cue, content)
      VALUES (new.id, new.cue, new.content);
    END;

    PRAGMA user_version = ${KNOWLEDGE_SCHEMA_VERSION};
  `
};
var createKnowledgeFallbackSchema = {
  version: KNOWLEDGE_SCHEMA_VERSION,
  sql: `
    CREATE TABLE knowledge (
      id INTEGER PRIMARY KEY,
      source_session_id TEXT NOT NULL CHECK (
        length(trim(source_session_id)) > 0
      ),
      scope TEXT NOT NULL CHECK (
        scope = 'global'
        OR (scope GLOB 'project:*' AND length(scope) > length('project:'))
        OR (scope GLOB 'session:*' AND length(scope) > length('session:'))
      ),
      cue TEXT NOT NULL CHECK (length(trim(cue)) > 0),
      content TEXT NOT NULL CHECK (length(trim(content)) > 0),
      state TEXT NOT NULL DEFAULT 'active' CHECK (
        state IN ('active', 'superseded', 'retired')
      ),
      replaces_id INTEGER REFERENCES knowledge(id),
      CHECK (replaces_id IS NULL OR replaces_id <> id)
    ) STRICT;

    CREATE INDEX knowledge_state_scope_idx
      ON knowledge (state, scope);

    CREATE INDEX knowledge_replaces_id_idx
      ON knowledge (replaces_id)
      WHERE replaces_id IS NOT NULL;

    PRAGMA user_version = ${KNOWLEDGE_SCHEMA_VERSION};
  `
};

// src/database/migrations/002-create-tool-events.ts
var createToolEventsSchema = {
  version: TOOL_EVENTS_SCHEMA_VERSION,
  sql: `
    CREATE TABLE tool_events (
      tool_use_id TEXT PRIMARY KEY CHECK (
        length(trim(tool_use_id)) > 0
      ),
      session_id TEXT NOT NULL CHECK (
        length(trim(session_id)) > 0
      ),
      scope TEXT NOT NULL CHECK (
        scope = 'global'
        OR (scope GLOB 'project:*' AND length(scope) > length('project:'))
        OR (scope GLOB 'session:*' AND length(scope) > length('session:'))
      ),
      tool_name TEXT NOT NULL CHECK (
        length(trim(tool_name)) > 0
      ),
      input TEXT NOT NULL CHECK (
        length(trim(input)) > 0
      ),
      result TEXT,
      outcome TEXT NOT NULL DEFAULT 'pending' CHECK (
        outcome IN ('pending', 'success', 'error')
      )
    ) STRICT;

    CREATE INDEX tool_events_session_outcome_idx
      ON tool_events (session_id, outcome);

    PRAGMA user_version = ${TOOL_EVENTS_SCHEMA_VERSION};
  `
};

// src/database/migrations/index.ts
var databaseMigrations = [
  createKnowledgeSchema,
  createToolEventsSchema
];

// src/database/database.ts
var DATABASE_FILENAME = "retrospective.sqlite3";
function resolveDatabasePath(environment = process.env, cwd = process.cwd()) {
  const dataDirectory = environment.RETROSPECTIVE_DATA_DIR ?? environment.PLUGIN_DATA ?? environment.CLAUDE_PLUGIN_DATA ?? resolveInstalledPluginDataDirectory(cwd);
  return join(
    dataDirectory ?? join(homedir(), ".codex", "retrospective"),
    DATABASE_FILENAME
  );
}
function resolveInstalledPluginDataDirectory(cwd) {
  const parts = resolve(cwd).split(sep);
  const cacheIndex = parts.lastIndexOf("cache");
  if (cacheIndex < 2 || parts[cacheIndex - 1] !== "plugins" || parts.length < cacheIndex + 4) {
    return void 0;
  }
  const marketplace = parts[cacheIndex + 1];
  const plugin = parts[cacheIndex + 2];
  if (!marketplace || !plugin) {
    return void 0;
  }
  const codexHome = parts.slice(0, cacheIndex - 1).join(sep) || sep;
  return join(codexHome, "plugins", "data", `${plugin}-${marketplace}`);
}
function openDatabase(path = resolveDatabasePath()) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 1000;");
    if (path !== ":memory:") {
      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    }
    applyMigrations(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
function applyMigrations(database) {
  const versionRow = database.prepare("PRAGMA user_version").get();
  const currentVersion = versionRow?.user_version ?? 0;
  const latestVersion = databaseMigrations.at(-1)?.version ?? 0;
  if (currentVersion > latestVersion) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${latestVersion}`
    );
  }
  for (const migration of databaseMigrations) {
    if (migration.version <= currentVersion) {
      continue;
    }
    try {
      inTransaction(database, () => database.exec(migration.sql));
    } catch (error) {
      if (migration.version === 1 && isMissingFts5(error)) {
        inTransaction(
          database,
          () => database.exec(createKnowledgeFallbackSchema.sql)
        );
        continue;
      }
      throw error;
    }
  }
}
function inTransaction(database, action) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
function isMissingFts5(error) {
  return error instanceof Error && error.message.includes("no such module: fts5");
}

// src/database/tool-events.ts
function countCompletedToolEvents(database, sessionId) {
  const row = database.prepare(`
      SELECT count(*) AS count
      FROM tool_events
      WHERE session_id = ? AND outcome <> 'pending'
    `).get(sessionId);
  return row.count;
}

// src/hooks/handlers.ts
function handleStop(database, input) {
  if (input.stop_hook_active || countCompletedToolEvents(database, input.session_id) === 0) {
    return void 0;
  }
  return {
    decision: "block",
    reason: [
      `Run the automatic retrospective for session ${input.session_id}.`,
      "Run the bundled retrospective skill and use its MCP tools to review the recorded evidence, reconcile reusable knowledge, and clear the processed events.",
      "Do not repeat the prior answer, expose chain-of-thought, or ask the user for confirmation. Keep any final confirmation to one short sentence."
    ].join(" ")
  };
}

// src/hooks/run.ts
import { readFileSync } from "node:fs";
function runHook(handler) {
  let database;
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    database = openDatabase();
    const output = handler(database, input);
    if (output !== void 0) {
      process.stdout.write(JSON.stringify(output));
    }
  } catch {
  } finally {
    database?.close();
  }
}

// src/hooks/stop.ts
runHook(handleStop);
