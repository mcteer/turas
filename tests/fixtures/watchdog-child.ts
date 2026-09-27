import { claimDueJobs } from "../../lib/server/conversations/watchdog";
import { closeRuntimePool } from "../../lib/server/db/client";

const workerId = process.argv[2];
if (!workerId || !/^restart-worker-[a-z]+$/.test(workerId)) {
  throw new Error("A synthetic restart worker ID is required");
}
try {
  const jobs = await claimDueJobs(workerId);
  process.stdout.write(JSON.stringify(jobs.map((job) => job.attemptId)));
} finally {
  await closeRuntimePool();
}
