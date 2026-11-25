import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {

  var __sql: ReturnType<typeof postgres> | undefined;
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps it compatible with pooled (pgbouncer) connections such as Neon's.
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}

const sql = globalThis.__sql ?? client();
if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
