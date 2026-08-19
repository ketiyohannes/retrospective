import type { DatabaseSync } from "node:sqlite";

import { inTransaction } from "./database.js";
import type {
  KnowledgeRecord,
  KnowledgeScope,
  KnowledgeState,
} from "./schema.js";
import { buildSearchQuery, buildSearchTerms } from "./text.js";

interface KnowledgeRow {
  id: number;
  source_session_id: string;
  scope: KnowledgeScope;
  cue: string;
  content: string;
  state: KnowledgeState;
  replaces_id: number | null;
}

interface SearchRow extends KnowledgeRow {
  rank: number;
}

export interface KnowledgeSearchResult extends KnowledgeRecord {
  rank: number;
}

export type KnowledgeChange =
  | {
      action: "add";
      scope: KnowledgeScope;
      cue: string;
      content: string;
    }
  | { action: "keep"; id: number }
  | { action: "replace"; id: number; cue: string; content: string }
  | { action: "retire"; id: number };

export interface AppliedKnowledgeChange {
  action: KnowledgeChange["action"];
  id: number;
  replacedId: number | null;
}

export function searchKnowledge(
  database: DatabaseSync,
  query: unknown,
  scopes: readonly [KnowledgeScope, KnowledgeScope, KnowledgeScope],
  limit = 3,
): KnowledgeSearchResult[] {
  const ftsQuery = buildSearchQuery(query);

  if (!ftsQuery || limit <= 0) {
    return [];
  }

  if (!hasFtsIndex(database)) {
    return searchKnowledgeWithoutFts(database, query, scopes, limit);
  }

  const rows = database
    .prepare(`
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
    `)
    .all(
      ftsQuery,
      scopes[0],
      scopes[1],
      scopes[2],
      scopes[0],
      scopes[1],
      limit,
    ) as unknown as SearchRow[];

  return rows.map((row) => ({ ...mapKnowledge(row), rank: row.rank }));
}

function searchKnowledgeWithoutFts(
  database: DatabaseSync,
  query: unknown,
  scopes: readonly [KnowledgeScope, KnowledgeScope, KnowledgeScope],
  limit: number,
): KnowledgeSearchResult[] {
  const terms = buildSearchTerms(query);

  if (terms.length === 0) {
    return [];
  }

  const termClause = terms
    .map(() => "(lower(k.cue) LIKE ? OR lower(k.content) LIKE ?)")
    .join(" OR ");
  const patterns = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
  const rows = database
    .prepare(`
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
    `)
    .all(
      `%${terms[0]}%`,
      scopes[0],
      scopes[1],
      scopes[2],
      ...patterns,
      scopes[0],
      scopes[1],
      limit,
    ) as unknown as SearchRow[];

  return rows.map((row) => ({ ...mapKnowledge(row), rank: row.rank }));
}

function hasFtsIndex(database: DatabaseSync): boolean {
  const row = database
    .prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'knowledge_fts'
    `)
    .get() as { sql: string } | undefined;

  return row?.sql.toLocaleUpperCase().includes("VIRTUAL TABLE") ?? false;
}

export function getKnowledge(
  database: DatabaseSync,
  id: number,
): KnowledgeRecord | undefined {
  const row = database
    .prepare(`
      SELECT id, source_session_id, scope, cue, content, state, replaces_id
      FROM knowledge
      WHERE id = ?
    `)
    .get(id) as KnowledgeRow | undefined;

  return row ? mapKnowledge(row) : undefined;
}

export function applyKnowledgeChanges(
  database: DatabaseSync,
  sourceSessionId: string,
  changes: readonly KnowledgeChange[],
): AppliedKnowledgeChange[] {
  if (!sourceSessionId.trim()) {
    throw new Error("Source session id cannot be empty");
  }

  return inTransaction(database, () =>
    applyKnowledgeChangesInTransaction(database, sourceSessionId, changes),
  );
}

export function applyKnowledgeChangesInTransaction(
  database: DatabaseSync,
  sourceSessionId: string,
  changes: readonly KnowledgeChange[],
): AppliedKnowledgeChange[] {
  if (!sourceSessionId.trim()) {
    throw new Error("Source session id cannot be empty");
  }

  return changes.map((change) =>
    applyKnowledgeChange(database, sourceSessionId, change),
  );
}

function applyKnowledgeChange(
  database: DatabaseSync,
  sourceSessionId: string,
  change: KnowledgeChange,
): AppliedKnowledgeChange {
  switch (change.action) {
    case "add": {
      const id = insertKnowledge(database, {
        sourceSessionId,
        scope: change.scope,
        cue: change.cue,
        content: change.content,
        replacesId: null,
      });
      return { action: change.action, id, replacedId: null };
    }

    case "keep": {
      requireActiveKnowledge(database, change.id);
      return { action: change.action, id: change.id, replacedId: null };
    }

    case "replace": {
      const current = requireActiveKnowledge(database, change.id);
      database
        .prepare("UPDATE knowledge SET state = 'superseded' WHERE id = ?")
        .run(current.id);
      const id = insertKnowledge(database, {
        sourceSessionId,
        scope: current.scope,
        cue: change.cue,
        content: change.content,
        replacesId: current.id,
      });
      return { action: change.action, id, replacedId: current.id };
    }

    case "retire": {
      const current = requireActiveKnowledge(database, change.id);
      database
        .prepare("UPDATE knowledge SET state = 'retired' WHERE id = ?")
        .run(current.id);
      return { action: change.action, id: current.id, replacedId: null };
    }
  }
}

function insertKnowledge(
  database: DatabaseSync,
  values: {
    sourceSessionId: string;
    scope: KnowledgeScope;
    cue: string;
    content: string;
    replacesId: number | null;
  },
): number {
  const cue = values.cue.trim();
  const content = values.content.trim();

  if (!cue || !content) {
    throw new Error("Knowledge cue and content cannot be empty");
  }

  const result = database
    .prepare(`
      INSERT INTO knowledge (
        source_session_id, scope, cue, content, state, replaces_id
      ) VALUES (?, ?, ?, ?, 'active', ?)
    `)
    .run(
      values.sourceSessionId,
      values.scope,
      cue,
      content,
      values.replacesId,
    );

  return Number(result.lastInsertRowid);
}

function requireActiveKnowledge(
  database: DatabaseSync,
  id: number,
): KnowledgeRecord {
  const knowledge = getKnowledge(database, id);

  if (!knowledge) {
    throw new Error(`Knowledge ${id} does not exist`);
  }

  if (knowledge.state !== "active") {
    throw new Error(`Knowledge ${id} is ${knowledge.state}, not active`);
  }

  return knowledge;
}

function mapKnowledge(row: KnowledgeRow): KnowledgeRecord {
  return {
    id: row.id,
    sourceSessionId: row.source_session_id,
    scope: row.scope,
    cue: row.cue,
    content: row.content,
    state: row.state,
    replacesId: row.replaces_id,
  };
}
