import { autoTagPreservedLinks } from "./workers/autoTagPreservedLinks";
import { startIndexing } from "./workers/linkIndexing";
import { linkProcessing } from "./workers/linkProcessing";
import { migrationWorker } from "./workers/migrationWorker";
import { startRSSPolling } from "./workers/rssPolling";
import { trialEndEmailWorker } from "./workers/trialEndEmailWorker";

const workerIntervalInSeconds =
  Number(process.env.ARCHIVE_SCRIPT_INTERVAL) || 10;

async function init() {
  await migrationWorker();

  console.log("\x1b[34m%s\x1b[0m", "Initializing the worker...");
  startRSSPolling();

  // Run linkProcessing in a separate context so its failure doesn't crash the worker
  linkProcessing(workerIntervalInSeconds).catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", "Link processing failed (will keep retrying):", err?.message);
  });

  autoTagPreservedLinks(workerIntervalInSeconds);
  startIndexing(workerIntervalInSeconds);
  trialEndEmailWorker();
}

init();
