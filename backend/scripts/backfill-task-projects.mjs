import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const mode = process.argv[2] ?? "--dry-run";
if (mode === "--help") {
  console.log("From backend: node scripts/backfill-task-projects.mjs [--dry-run|--apply|--verify]");
  process.exit(0);
}
if (process.argv.length > 3 || !["--dry-run", "--apply", "--verify"].includes(mode)) {
  throw new Error("Expected --dry-run, --apply, or --verify. No changes made.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

async function summarize() {
  const { rows: [summary] } = await client.query(`
    SELECT COUNT(*)::int AS tasks,
      COUNT(*) FILTER (WHERE t."completedAt" IS NOT NULL)::int AS completed,
      COUNT(*) FILTER (WHERE t."projectId" IS NULL)::int AS unassigned,
      COUNT(DISTINCT t."userId") FILTER (WHERE t."projectId" IS NULL)::int AS affected_owners,
      COUNT(*) FILTER (WHERE t."projectId" IS NOT NULL
        AND (p.id IS NULL OR p."ownerId" <> t."userId"))::int AS invalid_ownership
    FROM "Task" t LEFT JOIN "Project" p ON p.id = t."projectId"
  `);
  return summary;
}

async function taskFingerprint() {
  const { rows: [row] } = await client.query(`
    SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) - 'projectId' ORDER BY t.id)::text, '[]')) AS fingerprint
    FROM "Task" t
  `);
  return row.fingerprint;
}

try {
  await client.connect();
  await client.query(mode === "--apply" ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  if (mode === "--apply") {
    await client.query('LOCK TABLE "User", "Project", "Task" IN SHARE ROW EXCLUSIVE MODE');
  }

  const before = await summarize();
  console.log("Before:", before);
  if (before.invalid_ownership !== 0) throw new Error("Existing tasks have invalid project ownership. Resolve these before backfilling.");

  if (mode === "--apply") {
    const fingerprint = await taskFingerprint();
    const { rows: owners } = await client.query('SELECT DISTINCT "userId" FROM "Task" WHERE "projectId" IS NULL');
    let createdProjects = 0;
    let assignedTasks = 0;

    for (const { userId } of owners) {
      const { rows: existing } = await client.query(`
        SELECT id FROM "Project"
        WHERE "ownerId" = $1 AND attributes->>'taskProjectBackfill' = 'v1'
      `, [userId]);
      if (existing.length > 1) throw new Error("Multiple marked Imported Tasks projects exist for one owner. Review before continuing.");

      const projectId = existing[0]?.id ?? randomUUID();
      if (existing.length === 0) {
        await client.query(`
          INSERT INTO "Project" (id, name, description, goal, "ownerId", attributes)
          VALUES ($1, 'Imported Tasks', 'Tasks preserved from before project-based task tracking.', '', $2,
            '{"taskProjectBackfill":"v1"}'::jsonb)
        `, [projectId, userId]);
        createdProjects++;
      }

      const result = await client.query(`
        UPDATE "Task" SET "projectId" = $1 WHERE "userId" = $2 AND "projectId" IS NULL
      `, [projectId, userId]);
      assignedTasks += result.rowCount;
    }

    const after = await summarize();
    if (after.unassigned !== 0 || after.invalid_ownership !== 0 || fingerprint !== await taskFingerprint()) {
      throw new Error("Backfill verification failed. All changes will be rolled back.");
    }
    await client.query("COMMIT");
    console.log("Backfill committed:", { createdProjects, assignedTasks, ...after });
  } else {
    if (mode === "--verify" && before.unassigned !== 0) {
      throw new Error("Tasks still need projects. Do not make projectId required yet.");
    }
    await client.query("ROLLBACK");
    console.log(mode === "--verify" ? "Verified: every task has a project owned by its user." : "Dry run only. No records changed.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Backfill stopped:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
