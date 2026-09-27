import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { initDb } from "@workspace/db";
import app from "../src/app";
import { logger } from "../src/lib/logger";
import { sendPendingTrialReminders } from "../src/lib/trialReminder";

initDb(env.DB as D1Database);

app.listen(8080);

const handler = httpServerHandler({ port: 8080 });

export default {
  ...handler,
  async scheduled(_event, workerEnv, ctx) {
    initDb(workerEnv.DB);
    ctx.waitUntil(
      sendPendingTrialReminders(logger).catch((err) => {
        logger.error({ err }, "Trial reminder cron failed");
      }),
    );
  },
} satisfies ExportedHandler<{ DB: D1Database }>;
