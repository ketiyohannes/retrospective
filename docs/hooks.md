# Hooks And Lifecycle

The shared `hooks/hooks.json` is valid for Codex and Claude Code. It uses
`${CLAUDE_PLUGIN_ROOT}` because Claude Code defines it natively and Codex exports
the same variable for plugin-hook compatibility. Claude Code additionally loads
`hooks/claude-hooks.json` because it reports failed executions through a
separate `PostToolUseFailure` event.

## PreToolUse

1. Ignore calls to the retrospective MCP server.
2. Upsert a pending event by `tool_use_id`.
3. Search knowledge with the tool name and input as the query.
4. Return at most three relevant lessons as additional context.

The hook does not alter or deny the tool call.

## PostToolUse

1. Ignore calls to the retrospective MCP server.
2. Serialize and truncate the tool result.
3. Infer `success` or `error` from error fields and process exit codes.
4. Complete the pending row using the same `tool_use_id`.

If a matching pending row is absent, the hook creates and completes one so a
missed PreToolUse event does not lose the result.

## PostToolUseFailure

Claude Code sends failure details as top-level `error`, `is_interrupt`, and
`duration_ms` fields. The supplemental Claude hook serializes those fields and
completes the pending event with an `error` outcome. This file is not declared
in the Codex manifest because Codex does not expose that separate event.

## Stop

The Stop hook requests one additional model turn only when the session has
completed events and the host is not already processing a Stop continuation.
The bundled skill then reads the evidence and calls `apply_retrospective` once.

The continuation is intentionally guarded by `stop_hook_active`, preventing an
infinite Stop loop. Applying a retrospective also clears the events, providing
a second idempotency boundary.

## Trust And Failure

Codex requires review and trust for non-managed command hooks. Claude Code may
require workspace and MCP approval depending on installation scope. The plugin
does not attempt to bypass either host's trust model.

Every hook catches parsing, database, and handler errors and exits successfully
without output. Automatic memory may be skipped during a failure, but the
user's original operation continues.
