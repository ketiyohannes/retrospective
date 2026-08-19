import type { StopInput } from "./contracts.js";
import { handleStop } from "./handlers.js";
import { runHook } from "./run.js";

runHook<StopInput>(handleStop);
