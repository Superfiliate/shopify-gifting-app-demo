import { workerCycle, closeWorker } from "../app/gifting/worker.server";

if (process.env.DEMO_MODE === "true")
  throw new Error("The fixture demo cannot run the live worker");
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  while (!stopping) {
    await workerCycle();
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
} finally {
  await closeWorker();
}
