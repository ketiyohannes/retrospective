export const pluginName = "retrospective";

export {
  KNOWLEDGE_SCHEMA_VERSION,
  KNOWLEDGE_STATES,
  TOOL_EVENTS_SCHEMA_VERSION,
  TOOL_EVENT_OUTCOMES,
  type KnowledgeRecord,
  type KnowledgeScope,
  type KnowledgeState,
  type ToolEventOutcome,
  type ToolEventRecord,
} from "./database/schema.js";

export {
  databaseMigrations,
  type DatabaseMigration,
} from "./database/migrations/index.js";

export {
  applyMigrations,
  DATABASE_FILENAME,
  inTransaction,
  openDatabase,
  resolveDatabasePath,
} from "./database/database.js";

export {
  applyKnowledgeChanges,
  applyKnowledgeChangesInTransaction,
  getKnowledge,
  searchKnowledge,
  type AppliedKnowledgeChange,
  type KnowledgeChange,
  type KnowledgeSearchResult,
} from "./database/knowledge.js";

export {
  globalScope,
  projectScope,
  searchScopes,
  sessionScope,
} from "./database/scope.js";

export {
  buildSearchQuery,
  buildSearchTerms,
  serializeValue,
} from "./database/text.js";

export {
  clearSessionToolEvents,
  completeToolEvent,
  countCompletedToolEvents,
  findLatestCompletedSessionId,
  listCompletedToolEvents,
  recordPendingToolEvent,
  type PendingToolEvent,
} from "./database/tool-events.js";

export {
  applyRetrospective,
  getRetrospectiveContext,
  type AppliedRetrospective,
  type RetrospectiveContext,
} from "./retrospective/service.js";
