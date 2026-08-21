export const KNOWLEDGE_SCHEMA_VERSION = 1;
export const TOOL_EVENTS_SCHEMA_VERSION = 2;

export const KNOWLEDGE_STATES = ["active", "superseded", "retired"] as const;
export const TOOL_EVENT_OUTCOMES = ["pending", "success", "error"] as const;

export type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];
export type ToolEventOutcome = (typeof TOOL_EVENT_OUTCOMES)[number];

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

export interface ToolEventRecord {
  toolUseId: string;
  sessionId: string;
  scope: KnowledgeScope;
  toolName: string;
  input: string;
  result: string | null;
  outcome: ToolEventOutcome;
}
