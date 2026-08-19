import { KNOWLEDGE_SCHEMA_VERSION } from "../schema.js";

export const createKnowledgeSchema = {
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
  `,
} as const;

export const createKnowledgeFallbackSchema = {
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
  `,
} as const;
