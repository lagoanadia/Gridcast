import { currentUserId, mutate } from "../src/lib/store";
import { seedDb } from "../src/lib/seed";

const created = await mutate((db) => seedDb(db, currentUserId(), new Date(), !process.argv.includes("--no-demo"), !process.argv.includes("--no-demo")));
console.log(created ? "Seeded channels, templates, queue rules." : "Already seeded — nothing to do.");
