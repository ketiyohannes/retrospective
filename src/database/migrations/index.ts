import { createKnowledgeSchema } from "./001-create-knowledge.js";

export interface DatabaseMigration {
  version: number;
  sql: string;
}

export const databaseMigrations: readonly DatabaseMigration[] = [
  createKnowledgeSchema,
];
