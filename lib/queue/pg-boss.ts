import PgBoss from "pg-boss";
import { moderateComment } from "@/lib/agents/moderation-agent";

let boss: PgBoss | null = null;
let workerStarted = false;

export type ModerateCommentPayload = {
  pin_id: string;
  comment: string;
};

/** Queue names used in the application. */
export const QUEUES = {
  MODERATE_COMMENT: "moderate-comment",
} as const;

/**
 * Singleton pg-boss instance.
 * Starts the boss for enqueueing jobs. Workers must be started by a persistent
 * process, not by Vercel request handlers.
 * Requires DATABASE_URL in env. Returns null if not configured.
 */
export async function getPgBoss(): Promise<PgBoss | null> {
  if (boss) return boss;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("pg-boss: DATABASE_URL not configured, queue disabled");
    return null;
  }

  boss = new PgBoss({
    connectionString: databaseUrl,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInHours: 24,
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // 7 days
    deleteAfterDays: 14,
  });

  boss.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  await boss.start();

  return boss;
}

export async function startModerationWorker(): Promise<PgBoss | null> {
  const queue = await getPgBoss();
  if (!queue || workerStarted) return queue;

  await queue.work(QUEUES.MODERATE_COMMENT, async (jobs) => {
    for (const job of jobs) {
      const data = job.data as ModerateCommentPayload;
      try {
        await moderateComment(data.pin_id, data.comment);
      } catch (err) {
        console.error(`Moderation worker error for pin ${data.pin_id}:`, err);
      }
    }
  });

  workerStarted = true;
  return queue;
}
