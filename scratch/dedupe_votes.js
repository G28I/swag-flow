import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Finding duplicate votes...");
    const rawVotes = await prisma.vote.findMany({
      orderBy: { createdAt: "desc" },
    });

    const seen = new Set();
    const duplicateIds = [];

    for (const vote of rawVotes) {
      const key = `${vote.userId}:${vote.promptId}`;
      if (seen.has(key)) {
        duplicateIds.push(vote.id);
      } else {
        seen.add(key);
      }
    }

    console.log(`Found ${duplicateIds.length} duplicate votes out of ${rawVotes.length} total votes.`);

    if (duplicateIds.length > 0) {
      const result = await prisma.vote.deleteMany({
        where: { id: { in: duplicateIds } },
      });
      console.log(`Successfully deleted ${result.count} duplicate votes.`);
    }
  } catch (err) {
    console.error("Error deduping votes:", err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
