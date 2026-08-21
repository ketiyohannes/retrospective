import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { openDatabase } from "../database/database.js";
import { searchKnowledge } from "../database/knowledge.js";
import type { KnowledgeScope } from "../database/schema.js";
import { searchScopes } from "../database/scope.js";
import {
  applyRetrospective,
  getRetrospectiveContext,
} from "../retrospective/service.js";

const scopeSchema = z
  .string()
  .refine(
    (value) =>
      value === "global" ||
      (value.startsWith("project:") && value.length > "project:".length) ||
      (value.startsWith("session:") && value.length > "session:".length),
    "Expected global, project:<path>, or session:<id>",
  )
  .transform((value) => value as KnowledgeScope);

const knowledgeChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    scope: scopeSchema,
    cue: z.string().min(1),
    content: z.string().min(1),
  }),
  z.object({ action: z.literal("keep"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("replace"),
    id: z.number().int().positive(),
    cue: z.string().min(1),
    content: z.string().min(1),
  }),
  z.object({ action: z.literal("retire"), id: z.number().int().positive() }),
]);

const database = openDatabase();
const server = new McpServer(
  { name: "retrospective", version: "0.1.0" },
  {
    instructions:
      "Fetch retrospective context before applying changes. Store concise, reusable lessons supported by observable tool evidence. Never store hidden chain-of-thought. Replace only stale knowledge in the same scope; add narrower project or session overrides instead.",
  },
);

server.registerTool(
  "get_retrospective_context",
  {
    title: "Get retrospective context",
    description:
      "Load completed tool events and related active knowledge for a session. Omit session_id to use the latest session with completed events.",
    inputSchema: {
      session_id: z.string().min(1).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  ({ session_id }) => toolResult(getRetrospectiveContext(database, session_id)),
);

server.registerTool(
  "search_knowledge",
  {
    title: "Search retrospective knowledge",
    description:
      "Search active local knowledge relevant to a query in session, project, then global scope order.",
    inputSchema: {
      query: z.string().min(1),
      session_id: z.string().min(1),
      cwd: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(3),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  ({ query, session_id, cwd, limit }) =>
    toolResult(
      searchKnowledge(database, query, searchScopes(session_id, cwd), limit),
    ),
);

server.registerTool(
  "apply_retrospective",
  {
    title: "Apply retrospective",
    description:
      "Atomically add, keep, replace, or retire local knowledge, then clear the processed session events. Call once after reviewing context, including with an empty changes array when no durable lesson exists.",
    inputSchema: {
      session_id: z.string().min(1),
      changes: z.array(knowledgeChangeSchema).max(50),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  ({ session_id, changes }) =>
    toolResult(applyRetrospective(database, session_id, changes)),
);

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error(error);
  database.close();
  process.exitCode = 1;
}
