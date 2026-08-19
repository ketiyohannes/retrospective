import type { DatabaseSync } from "node:sqlite";

import { inTransaction } from "../database/database.js";
import {
  applyKnowledgeChangesInTransaction,
  searchKnowledge,
  type AppliedKnowledgeChange,
  type KnowledgeChange,
  type KnowledgeSearchResult,
} from "../database/knowledge.js";
import { searchScopes } from "../database/scope.js";
import type { ToolEventRecord } from "../database/schema.js";
import { serializeValue } from "../database/text.js";
import {
  clearSessionToolEvents,
  findLatestCompletedSessionId,
  listCompletedToolEvents,
} from "../database/tool-events.js";

export interface RetrospectiveContext {
  sessionId: string | null;
  events: ToolEventRecord[];
  relatedKnowledge: KnowledgeSearchResult[];
}

export interface AppliedRetrospective {
  sessionId: string;
  applied: AppliedKnowledgeChange[];
  clearedEvents: number;
}

export function getRetrospectiveContext(
  database: DatabaseSync,
  requestedSessionId?: string,
): RetrospectiveContext {
  const sessionId =
    requestedSessionId?.trim() || findLatestCompletedSessionId(database);

  if (!sessionId) {
    return { sessionId: null, events: [], relatedKnowledge: [] };
  }

  const events = listCompletedToolEvents(database, sessionId);
  const project = events.find(({ scope }) => scope.startsWith("project:"))?.scope;
  const query = serializeValue(
    events.map(({ toolName, input, result, outcome }) => ({
      toolName,
      input,
      result,
      outcome,
    })),
    12_000,
  );
  const relatedKnowledge = project
    ? searchKnowledge(database, query, searchScopes(sessionId, project), 10)
    : [];

  return { sessionId, events, relatedKnowledge };
}

export function applyRetrospective(
  database: DatabaseSync,
  sessionId: string,
  changes: readonly KnowledgeChange[],
): AppliedRetrospective {
  return inTransaction(database, () => {
    const applied = applyKnowledgeChangesInTransaction(
      database,
      sessionId,
      changes,
    );
    const clearedEvents = clearSessionToolEvents(database, sessionId);

    return { sessionId, applied, clearedEvents };
  });
}
