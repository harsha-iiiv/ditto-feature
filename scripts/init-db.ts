import { readFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const sql = postgres(databaseUrl, { ssl: "require" });

  try {
    await sql.unsafe(schema);
    console.log("Database schema applied.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
