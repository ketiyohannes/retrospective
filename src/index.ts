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
