import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../database/database.js";

export function runHook<Input>(
  handler: (database: DatabaseSync, input: Input) => unknown,
): void {
  let database: DatabaseSync | undefined;

  try {
    const input = JSON.parse(readFileSync(0, "utf8")) as Input;
    database = openDatabase();
    const output = handler(database, input);

    if (output !== undefined) {
      process.stdout.write(JSON.stringify(output));
    }
  } catch {
    // Hooks are observational and must not interrupt the user's tool call or turn.
  } finally {
    database?.close();
  }
}
