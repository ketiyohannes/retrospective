import { createKnowledgeSchema } from "./001-create-knowledge.js";
import { createToolEventsSchema } from "./002-create-tool-events.js";

export interface DatabaseMigration {
  version: number;
  sql: string;
}

export const databaseMigrations: readonly DatabaseMigration[] = [
  createKnowledgeSchema,
  createToolEventsSchema,
];
