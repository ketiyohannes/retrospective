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

// src/database/text.ts
var DEFAULT_STORAGE_LIMIT = 16e3;
function serializeValue(value, limit = DEFAULT_STORAGE_LIMIT) {
  let serialized;
  if (typeof value === "string") {
    serialized = value;
  } else {
    try {
      serialized = JSON.stringify(value) ?? "null";
    } catch {
      serialized = String(value);
    }
  }
  const normalized = serialized.trim() || "null";
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}
[truncated]`;
}

// src/database/scope.ts
import { resolve as resolve2 } from "node:path";
function projectScope(cwd) {
  const normalizedCwd = cwd.trim();
  if (!normalizedCwd) {
    throw new Error("Project working directory cannot be empty");
  }
  const projectPath = resolve2(normalizedCwd);
  return `project:${projectPath}`;
}

// src/database/tool-events.ts
function recordPendingToolEvent(database, event) {
  database.prepare(`
      INSERT INTO tool_events (
        tool_use_id, session_id, scope, tool_name, input, result, outcome
      ) VALUES (?, ?, ?, ?, ?, NULL, 'pending')
      ON CONFLICT(tool_use_id) DO UPDATE SET
        session_id = excluded.session_id,
        scope = excluded.scope,
        tool_name = excluded.tool_name,
        input = excluded.input,
        result = NULL,
        outcome = 'pending'
    `).run(
    event.toolUseId,
    event.sessionId,
    event.scope,
    event.toolName,
    event.input
  );
}
function completeToolEvent(database, toolUseId, result, outcome) {
  const update = database.prepare(`
      UPDATE tool_events
      SET result = ?, outcome = ?
      WHERE tool_use_id = ?
    `).run(result, outcome, toolUseId);
  return update.changes > 0;
}

// src/hooks/handlers.ts
var MAX_EVENT_TEXT = 6e3;
function handlePostToolUse(database, input) {
  if (isRetrospectiveTool(input.tool_name)) {
    return;
  }
  const result = serializeValue(input.tool_response, MAX_EVENT_TEXT);
  const outcome = inferOutcome(input.tool_response);
  const updated = completeToolEvent(
    database,
    input.tool_use_id,
    result,
    outcome
  );
  if (!updated) {
    recordPendingToolEvent(database, {
      toolUseId: input.tool_use_id,
      sessionId: input.session_id,
      scope: projectScope(input.cwd),
      toolName: input.tool_name,
      input: serializeValue(input.tool_input, MAX_EVENT_TEXT)
    });
    completeToolEvent(database, input.tool_use_id, result, outcome);
  }
}
function inferOutcome(response) {
  if (!response || typeof response !== "object") {
    return "success";
  }
  const record = response;
  if (record.isError === true || record.error !== void 0) {
    return "error";
  }
  const exitCode = record.exit_code ?? record.exitCode;
  return typeof exitCode === "number" && exitCode !== 0 ? "error" : "success";
}
function isRetrospectiveTool(toolName) {
  return toolName.startsWith("mcp__retrospective__") || toolName.startsWith("mcp__retrospective_");
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

// src/hooks/post-tool-use.ts
runHook(handlePostToolUse);
