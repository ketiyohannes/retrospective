import { TOOL_EVENTS_SCHEMA_VERSION } from "../schema.js";

export const createToolEventsSchema = {
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
  `,
} as const;
