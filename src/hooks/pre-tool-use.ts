import type { PreToolUseInput } from "./contracts.js";
import { handlePreToolUse } from "./handlers.js";
import { runHook } from "./run.js";

runHook<PreToolUseInput>(handlePreToolUse);
