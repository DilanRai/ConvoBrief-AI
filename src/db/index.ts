import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type PgliteDatabase = ReturnType<typeof drizzlePglite<typeof schema>>;
type PostgresDatabase = ReturnType<typeof drizzlePostgres<typeof schema>>;
type AppDatabase = PgliteDatabase | PostgresDatabase;

const databaseUrl = process.env.DATABASE_URL;
const useLocalDatabase =
  process.env.USE_LOCAL_DB === "true" ||
  (!databaseUrl && process.env.NODE_ENV !== "production");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __convobriefPglite?: PGlite;
  __convobriefDatabase?: AppDatabase;
  __convobriefDatabaseReady?: Promise<void>;
};

function localDataPath(): string {
  return path.join(process.cwd(), ".data", "convobrief");
}

function createDatabase(): AppDatabase {
  if (useLocalDatabase) {
    const dataPath = localDataPath();
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    const client = (globalForDb.__convobriefPglite ??= new PGlite(dataPath));
    return drizzlePglite(client, { schema });
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }

  const pool = (globalForDb.__arenaNextJsPostgresqlPool ??= new Pool({
    connectionString: databaseUrl,
  }));
  return drizzlePostgres(pool, { schema });
}

function getDatabase(): AppDatabase {
  return (globalForDb.__convobriefDatabase ??= createDatabase());
}

// Lazily construct the client so importing route modules (including during
// `next build`) never opens PGlite or connects to Postgres.
export const db = new Proxy({} as AppDatabase, {
  get(_target, property) {
    const instance = getDatabase();
    const value = Reflect.get(instance as object, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, property) {
    return property in (getDatabase() as object);
  },
});

export async function ensureDatabaseReady(): Promise<void> {
  if (!useLocalDatabase) {
    getDatabase();
    return;
  }

  // Build workers must not open or migrate the local database.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (!globalForDb.__convobriefDatabaseReady) {
    globalForDb.__convobriefDatabaseReady = (async () => {
      const instance = getDatabase() as PgliteDatabase;
      await migratePglite(instance, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
    })().catch((error) => {
      // Do not cache a rejected promise; allow the next request to retry.
      globalForDb.__convobriefDatabaseReady = undefined;
      throw error;
    });
  }

  await globalForDb.__convobriefDatabaseReady;
}

export { schema };
