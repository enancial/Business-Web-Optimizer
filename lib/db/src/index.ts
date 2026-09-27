import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema>;

let instance: Database | null = null;

export function initDb(binding: D1Database): Database {
  instance = drizzle(binding, { schema });
  return instance;
}

export function isDbReady(): boolean {
  return instance !== null;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    if (!instance) {
      throw new Error(
        "Database not initialised: initDb(env.DB) was never called.",
      );
    }
    return Reflect.get(instance, prop, receiver);
  },
});

export * from "./schema";
