export const KNOWLEDGE_SCHEMA_VERSION = 1;

export const KNOWLEDGE_STATES = ["active", "superseded", "retired"] as const;

export type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];

export type KnowledgeScope =
  | "global"
  | `project:${string}`
  | `session:${string}`;

export interface KnowledgeRecord {
  id: number;
  sourceSessionId: string;
  scope: KnowledgeScope;
  cue: string;
  content: string;
  state: KnowledgeState;
  replacesId: number | null;
}
