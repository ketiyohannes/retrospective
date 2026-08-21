import { resolve } from "node:path";

import type { KnowledgeScope } from "./schema.js";

export function globalScope(): KnowledgeScope {
  return "global";
}

export function projectScope(cwd: string): KnowledgeScope {
  const normalizedCwd = cwd.trim();

  if (!normalizedCwd) {
    throw new Error("Project working directory cannot be empty");
  }

  const projectPath = resolve(normalizedCwd);
  return `project:${projectPath}`;
}

export function sessionScope(sessionId: string): KnowledgeScope {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    throw new Error("Session id cannot be empty");
  }

  return `session:${normalizedSessionId}`;
}

export function searchScopes(
  sessionId: string,
  cwdOrProjectScope: string,
): readonly [KnowledgeScope, KnowledgeScope, KnowledgeScope] {
  const project = cwdOrProjectScope.startsWith("project:")
    ? validateProjectScope(cwdOrProjectScope)
    : projectScope(cwdOrProjectScope);

  return [sessionScope(sessionId), project, globalScope()];
}

function validateProjectScope(value: string): KnowledgeScope {
  if (!value.slice("project:".length).trim()) {
    throw new Error("Project scope cannot be empty");
  }

  return value as KnowledgeScope;
}
