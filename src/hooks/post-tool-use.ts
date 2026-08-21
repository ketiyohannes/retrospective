import type { PostToolUseInput } from "./contracts.js";
import { handlePostToolUse } from "./handlers.js";
import { runHook } from "./run.js";

runHook<PostToolUseInput>(handlePostToolUse);
