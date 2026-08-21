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
var MAX_SEARCH_TERMS = 24;
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
function buildSearchQuery(value) {
  const terms = buildSearchTerms(value);
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" OR ");
}
function buildSearchTerms(value) {
  const terms = serializeValue(value, 4e3).toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu);
  return terms ? [...new Set(terms)].slice(0, MAX_SEARCH_TERMS) : [];
}

// src/database/knowledge.ts
function searchKnowledge(database, query, scopes, limit = 3) {
  const ftsQuery = buildSearchQuery(query);
  if (!ftsQuery || limit <= 0) {
    return [];
  }
  if (!hasFtsIndex(database)) {
    return searchKnowledgeWithoutFts(database, query, scopes, limit);
  }
  const rows = database.prepare(`
      SELECT
        k.id,
        k.source_session_id,
        k.scope,
        k.cue,
        k.content,
        k.state,
        k.replaces_id,
        bm25(knowledge_fts, 8.0, 1.0) AS rank
      FROM knowledge_fts
      JOIN knowledge AS k ON k.id = knowledge_fts.rowid
      WHERE knowledge_fts MATCH ?
        AND k.state = 'active'
        AND k.scope IN (?, ?, ?)
      ORDER BY
        CASE k.scope WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END,
        rank,
        k.id DESC
      LIMIT ?
    `).all(
    ftsQuery,
    scopes[0],
    scopes[1],
    scopes[2],
    scopes[0],
    scopes[1],
    limit
  );
  return rows.map((row) => ({ ...mapKnowledge(row), rank: row.rank }));
}
function searchKnowledgeWithoutFts(database, query, scopes, limit) {
  const terms = buildSearchTerms(query);
  if (terms.length === 0) {
    return [];
  }
  const termClause = terms.map(() => "(lower(k.cue) LIKE ? OR lower(k.content) LIKE ?)").join(" OR ");
  const patterns = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
  const rows = database.prepare(`
      SELECT
        k.id,
        k.source_session_id,
        k.scope,
        k.cue,
        k.content,
        k.state,
        k.replaces_id,
        CASE WHEN lower(k.cue) LIKE ? THEN 0.0 ELSE 1.0 END AS rank
      FROM knowledge AS k
      WHERE k.state = 'active'
        AND k.scope IN (?, ?, ?)
        AND (${termClause})
      ORDER BY
        CASE k.scope WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END,
        rank,
        k.id DESC
      LIMIT ?
    `).all(
    `%${terms[0]}%`,
    scopes[0],
    scopes[1],
    scopes[2],
    ...patterns,
    scopes[0],
    scopes[1],
    limit
  );
  return rows.map((row) => ({ ...mapKnowledge(row), rank: row.rank }));
}
function hasFtsIndex(database) {
  const row = database.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'knowledge_fts'
    `).get();
  return row?.sql.toLocaleUpperCase().includes("VIRTUAL TABLE") ?? false;
}
function mapKnowledge(row) {
  return {
    id: row.id,
    sourceSessionId: row.source_session_id,
    scope: row.scope,
    cue: row.cue,
    content: row.content,
    state: row.state,
    replacesId: row.replaces_id
  };
}

// src/database/scope.ts
import { resolve as resolve2 } from "node:path";
function globalScope() {
  return "global";
}
function projectScope(cwd) {
  const normalizedCwd = cwd.trim();
  if (!normalizedCwd) {
    throw new Error("Project working directory cannot be empty");
  }
  const projectPath = resolve2(normalizedCwd);
  return `project:${projectPath}`;
}
function sessionScope(sessionId) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("Session id cannot be empty");
  }
  return `session:${normalizedSessionId}`;
}
function searchScopes(sessionId, cwdOrProjectScope) {
  const project = cwdOrProjectScope.startsWith("project:") ? validateProjectScope(cwdOrProjectScope) : projectScope(cwdOrProjectScope);
  return [sessionScope(sessionId), project, globalScope()];
}
function validateProjectScope(value) {
  if (!value.slice("project:".length).trim()) {
    throw new Error("Project scope cannot be empty");
  }
  return value;
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

// src/hooks/handlers.ts
var MAX_EVENT_TEXT = 6e3;
function handlePreToolUse(database, input) {
  if (isRetrospectiveTool(input.tool_name)) {
    return void 0;
  }
  const scope = projectScope(input.cwd);
  recordPendingToolEvent(database, {
    toolUseId: input.tool_use_id,
    sessionId: input.session_id,
    scope,
    toolName: input.tool_name,
    input: serializeValue(input.tool_input, MAX_EVENT_TEXT)
  });
  const knowledge = searchKnowledge(
    database,
    { tool: input.tool_name, input: input.tool_input },
    searchScopes(input.session_id, scope),
    3
  );
  if (knowledge.length === 0) {
    return void 0;
  }
  const lines = knowledge.map(
    ({ scope: knowledgeScope, cue, content }) => `- [${knowledgeScope}] ${cue}: ${content}`
  );
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: [
        "Relevant retrospective knowledge. Apply it only when it fits this tool call:",
        ...lines
      ].join("\n")
    }
  };
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

// src/hooks/pre-tool-use.ts
runHook(handlePreToolUse);
