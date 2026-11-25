import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

declare global {
  var __thiriDb: DB | undefined;
}

/**
 * The connection is created on first use, not at import time, so `next build`
 * can analyse routes without a database.
 */
function getDb(): DB {
  if (globalThis.__thiriDb) return globalThis.__thiriDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps it compatible with pooled (pgbouncer) connections such as Neon's.
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  const instance = drizzle(sql, { schema });
  globalThis.__thiriDb = instance;
  return instance;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
