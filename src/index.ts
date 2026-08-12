export const pluginName = "retrospective";

export {
  KNOWLEDGE_SCHEMA_VERSION,
  KNOWLEDGE_STATES,
  type KnowledgeRecord,
  type KnowledgeScope,
  type KnowledgeState,
} from "./database/schema.js";

export {
  databaseMigrations,
  type DatabaseMigration,
} from "./database/migrations/index.js";
