import type { DatabaseSync } from "node:sqlite";

import type {
  KnowledgeScope,
  ToolEventOutcome,
  ToolEventRecord,
} from "./schema.js";

interface ToolEventRow {
  tool_use_id: string;
  session_id: string;
  scope: KnowledgeScope;
  tool_name: string;
  input: string;
  result: string | null;
  outcome: ToolEventOutcome;
}

export interface PendingToolEvent {
  toolUseId: string;
  sessionId: string;
  scope: KnowledgeScope;
  toolName: string;
  input: string;
}

export function recordPendingToolEvent(
  database: DatabaseSync,
  event: PendingToolEvent,
): void {
  database
    .prepare(`
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
    `)
    .run(
      event.toolUseId,
      event.sessionId,
      event.scope,
      event.toolName,
      event.input,
    );
}

export function completeToolEvent(
  database: DatabaseSync,
  toolUseId: string,
  result: string,
  outcome: Exclude<ToolEventOutcome, "pending">,
): boolean {
  const update = database
    .prepare(`
      UPDATE tool_events
      SET result = ?, outcome = ?
      WHERE tool_use_id = ?
    `)
    .run(result, outcome, toolUseId);

  return update.changes > 0;
}

export function listCompletedToolEvents(
  database: DatabaseSync,
  sessionId: string,
): ToolEventRecord[] {
  const rows = database
    .prepare(`
      SELECT tool_use_id, session_id, scope, tool_name, input, result, outcome
      FROM tool_events
      WHERE session_id = ? AND outcome <> 'pending'
      ORDER BY rowid
    `)
    .all(sessionId) as unknown as ToolEventRow[];

  return rows.map(mapToolEvent);
}

export function countCompletedToolEvents(
  database: DatabaseSync,
  sessionId: string,
): number {
  const row = database
    .prepare(`
      SELECT count(*) AS count
      FROM tool_events
      WHERE session_id = ? AND outcome <> 'pending'
    `)
    .get(sessionId) as { count: number };

  return row.count;
}

export function findLatestCompletedSessionId(
  database: DatabaseSync,
): string | undefined {
  const row = database
    .prepare(`
      SELECT session_id
      FROM tool_events
      WHERE outcome <> 'pending'
      ORDER BY rowid DESC
      LIMIT 1
    `)
    .get() as { session_id: string } | undefined;

  return row?.session_id;
}

export function clearSessionToolEvents(
  database: DatabaseSync,
  sessionId: string,
): number {
  return Number(
    database
      .prepare("DELETE FROM tool_events WHERE session_id = ?")
      .run(sessionId).changes,
  );
}

function mapToolEvent(row: ToolEventRow): ToolEventRecord {
  return {
    toolUseId: row.tool_use_id,
    sessionId: row.session_id,
    scope: row.scope,
    toolName: row.tool_name,
    input: row.input,
    result: row.result,
    outcome: row.outcome,
  };
}
