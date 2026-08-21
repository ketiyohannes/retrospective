import type { DatabaseSync } from "node:sqlite";

import { searchKnowledge } from "../database/knowledge.js";
import { projectScope, searchScopes } from "../database/scope.js";
import { serializeValue } from "../database/text.js";
import {
  completeToolEvent,
  countCompletedToolEvents,
  recordPendingToolEvent,
} from "../database/tool-events.js";
import type {
  AdditionalContextOutput,
  ContinueTurnOutput,
  PostToolUseFailureInput,
  PostToolUseInput,
  PreToolUseInput,
  StopInput,
} from "./contracts.js";

const MAX_EVENT_TEXT = 6_000;

export function handlePreToolUse(
  database: DatabaseSync,
  input: PreToolUseInput,
): AdditionalContextOutput | undefined {
  if (isRetrospectiveTool(input.tool_name)) {
    return undefined;
  }

  const scope = projectScope(input.cwd);
  recordPendingToolEvent(database, {
    toolUseId: input.tool_use_id,
    sessionId: input.session_id,
    scope,
    toolName: input.tool_name,
    input: serializeValue(input.tool_input, MAX_EVENT_TEXT),
  });

  const knowledge = searchKnowledge(
    database,
    { tool: input.tool_name, input: input.tool_input },
    searchScopes(input.session_id, scope),
    3,
  );

  if (knowledge.length === 0) {
    return undefined;
  }

  const lines = knowledge.map(
    ({ scope: knowledgeScope, cue, content }) =>
      `- [${knowledgeScope}] ${cue}: ${content}`,
  );

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: [
        "Relevant retrospective knowledge. Apply it only when it fits this tool call:",
        ...lines,
      ].join("\n"),
    },
  };
}

export function handlePostToolUse(
  database: DatabaseSync,
  input: PostToolUseInput,
): void {
  if (isRetrospectiveTool(input.tool_name)) {
    return;
  }

  const result = serializeValue(input.tool_response, MAX_EVENT_TEXT);
  const outcome = inferOutcome(input.tool_response);
  const updated = completeToolEvent(
    database,
    input.tool_use_id,
    result,
    outcome,
  );

  if (!updated) {
    recordPendingToolEvent(database, {
      toolUseId: input.tool_use_id,
      sessionId: input.session_id,
      scope: projectScope(input.cwd),
      toolName: input.tool_name,
      input: serializeValue(input.tool_input, MAX_EVENT_TEXT),
    });
    completeToolEvent(database, input.tool_use_id, result, outcome);
  }
}

export function handlePostToolUseFailure(
  database: DatabaseSync,
  input: PostToolUseFailureInput,
): void {
  if (isRetrospectiveTool(input.tool_name)) {
    return;
  }

  const result = serializeValue(
    {
      error: input.error,
      is_interrupt: input.is_interrupt,
      duration_ms: input.duration_ms,
    },
    MAX_EVENT_TEXT,
  );
  const updated = completeToolEvent(
    database,
    input.tool_use_id,
    result,
    "error",
  );

  if (!updated) {
    recordPendingToolEvent(database, {
      toolUseId: input.tool_use_id,
      sessionId: input.session_id,
      scope: projectScope(input.cwd),
      toolName: input.tool_name,
      input: serializeValue(input.tool_input, MAX_EVENT_TEXT),
    });
    completeToolEvent(database, input.tool_use_id, result, "error");
  }
}

export function handleStop(
  database: DatabaseSync,
  input: StopInput,
): ContinueTurnOutput | undefined {
  if (
    input.stop_hook_active ||
    countCompletedToolEvents(database, input.session_id) === 0
  ) {
    return undefined;
  }

  return {
    decision: "block",
    reason: [
      `Run the automatic retrospective for session ${input.session_id}.`,
      "Run the bundled retrospective skill and use its MCP tools to review the recorded evidence, reconcile reusable knowledge, and clear the processed events.",
      "Do not repeat the prior answer, expose chain-of-thought, or ask the user for confirmation. Keep any final confirmation to one short sentence.",
    ].join(" "),
  };
}

export function inferOutcome(
  response: unknown,
): "success" | "error" {
  if (!response || typeof response !== "object") {
    return "success";
  }

  const record = response as Record<string, unknown>;
  if (record.isError === true || record.error !== undefined) {
    return "error";
  }

  const exitCode = record.exit_code ?? record.exitCode;
  return typeof exitCode === "number" && exitCode !== 0 ? "error" : "success";
}

export function isRetrospectiveTool(toolName: string): boolean {
  return (
    toolName.startsWith("mcp__retrospective__") ||
    toolName.startsWith("mcp__retrospective_")
  );
}
