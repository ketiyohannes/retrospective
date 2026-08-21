import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { databaseMigrations } from "./migrations/index.js";
import { createKnowledgeFallbackSchema } from "./migrations/001-create-knowledge.js";

export const DATABASE_FILENAME = "retrospective.sqlite3";

export function resolveDatabasePath(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): string {
  const dataDirectory =
    environment.RETROSPECTIVE_DATA_DIR ??
    environment.PLUGIN_DATA ??
    environment.CLAUDE_PLUGIN_DATA ??
    resolveInstalledPluginDataDirectory(cwd);

  return join(
    dataDirectory ?? join(homedir(), ".codex", "retrospective"),
    DATABASE_FILENAME,
  );
}

function resolveInstalledPluginDataDirectory(cwd: string): string | undefined {
  const parts = resolve(cwd).split(sep);
  const cacheIndex = parts.lastIndexOf("cache");

  if (
    cacheIndex < 2 ||
    parts[cacheIndex - 1] !== "plugins" ||
    parts.length < cacheIndex + 4
  ) {
    return undefined;
  }

  const marketplace = parts[cacheIndex + 1];
  const plugin = parts[cacheIndex + 2];
  if (!marketplace || !plugin) {
    return undefined;
  }

  const codexHome = parts.slice(0, cacheIndex - 1).join(sep) || sep;
  return join(codexHome, "plugins", "data", `${plugin}-${marketplace}`);
}

export function openDatabase(path = resolveDatabasePath()): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const database = new DatabaseSync(path);

  try {
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 1000;");

    if (path !== ":memory:") {
      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    }

    applyMigrations(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function applyMigrations(database: DatabaseSync): void {
  const versionRow = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const currentVersion = versionRow?.user_version ?? 0;
  const latestVersion = databaseMigrations.at(-1)?.version ?? 0;

  if (currentVersion > latestVersion) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${latestVersion}`,
    );
  }

  for (const migration of databaseMigrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    try {
      inTransaction(database, () => database.exec(migration.sql));
    } catch (error) {
      if (migration.version === 1 && isMissingFts5(error)) {
        inTransaction(database, () =>
          database.exec(createKnowledgeFallbackSchema.sql),
        );
        continue;
      }

      throw error;
    }
  }
}

export function inTransaction<T>(database: DatabaseSync, action: () => T): T {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = action();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function isMissingFts5(error: unknown): boolean {
  return error instanceof Error && error.message.includes("no such module: fts5");
}
