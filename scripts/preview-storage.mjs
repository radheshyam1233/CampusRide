import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

export function localStorage(path = ":memory:", migrate = true) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)",
  );
  if (migrate) applyLocalMigrations(sqlite);
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          const rawAll = () => ({ results: statement.all(...values) });
          return {
            rawAll,
            first: async () => statement.get(...values) ?? null,
            all: async () => rawAll(),
            run: async () => ({ meta: statement.run(...values) }),
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) => statement.rawAll());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const objects = new Map();
  const BUCKET = {
    async put(key, body, { httpMetadata }) {
      objects.set(key, { body, httpMetadata });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
  return { DB, BUCKET, sqlite };
}

export function applyLocalMigrations(sqlite) {
  const directory = new URL("../drizzle/", import.meta.url);
  const hasMigration = sqlite.prepare(
    "SELECT name FROM local_migrations WHERE name = ?",
  );
  const insertMigration = sqlite.prepare(
    "INSERT INTO local_migrations VALUES (?)",
  );
  for (const name of readdirSync(directory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()) {
    if (hasMigration.get(name)) continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(new URL(name, directory), "utf8"));
      insertMigration.run(name);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}
