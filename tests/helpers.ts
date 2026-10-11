import { emptyDb } from "@/lib/store";
import { seedDb } from "@/lib/seed";

export const USER = "u1";
export const NOW = new Date("2026-10-12T10:00:00Z"); // Monday

export function seeded() {
  const db = emptyDb();
  seedDb(db, USER, NOW, true);
  return db;
}
export const channel = (db: ReturnType<typeof seeded>, name: string) => db.channels.find((c) => c.name === name)!;
