export interface CommonHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

export interface PreToolUseInput extends CommonHookInput {
  tool_name: string;
  tool_use_id: string;
  tool_input: unknown;
}

export interface PostToolUseInput extends PreToolUseInput {
  tool_response: unknown;
}

export interface StopInput extends CommonHookInput {
  stop_hook_active: boolean;
}

export interface AdditionalContextOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    additionalContext: string;
  };
}

export interface ContinueTurnOutput {
  decision: "block";
  reason: string;
}
