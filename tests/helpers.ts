import { emptyDb } from "@/lib/store";
import { seedFixture } from "./fixtures";

export const USER = "u1";
export const NOW = new Date("2026-10-12T10:00:00Z"); // Monday

export function seeded() {
  const db = emptyDb();
  seedFixture(db, USER, NOW, true);
  return db;
}
export const channel = (db: ReturnType<typeof seeded>, name: string) => db.channels.find((c) => c.name === name)!;
