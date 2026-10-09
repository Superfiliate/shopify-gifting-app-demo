import { Pool } from "pg";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import db from "../db.server";
import { assertConfiguredShop, unauthenticated } from "../shopify.server";
import { shipmentSchema } from "./schemas";
import { getIntegrationConfig } from "./config.server";
import { createSuperfiliate } from "./superfiliate.server";
import { createShopifyGateway } from "./shopify-gateway.server";
import { processGift, type SaveGift } from "./process-gift";
import { importReadyRewards } from "./import-rewards.server";
import { ReviewRequired } from "./types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
pool.on("error", () => console.error("Worker database connection interrupted"));

export async function saveGift(id: string, patch: Parameters<SaveGift>[0]) {
  const { reward, shipment, fulfillRequest, ...data } = patch;
  const update = {
    ...data,
    ...(reward === null ? { reward: Prisma.DbNull } : {}),
    ...(shipment ? { shipment: { ...shipment } } : {}),
    ...(fulfillRequest ? { fulfillRequest: { ...fulfillRequest } } : {}),
  };
  if (data.creationAttempted === true) {
    const claimed = await db.giftSync.updateMany({
      where: {
        id,
        creationAttempted: false,
        draftOrderId: null,
        orderId: null,
      },
      data: update,
    });
    if (!claimed.count)
      throw new ReviewRequired(
        "Another worker already claimed this gift. Reconcile Shopify before retrying.",
      );
  } else {
    await db.giftSync.update({ where: { id }, data: update });
  }
}

export async function workerCycle() {
  const config = getIntegrationConfig();
  const connection = await pool.connect();
  const lockKey = `gifting:${config.shop}`;
  let locked = false;
  let brokenConnection = false;
  const onConnectionError = () => {
    brokenConnection = true;
  };
  connection.on("error", onConnectionError);
  try {
    const lock = await connection.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockKey],
    );
    locked = lock.rows[0].locked;
    if (!locked) return;
    assertConfiguredShop(config.shop);
    const settings = await db.shopSettings.upsert({
      where: { shop: config.shop },
      create: { shop: config.shop },
      update: {},
    });
    if (settings.uninstalledAt) return;
    const superfiliate = createSuperfiliate();
    const { admin } = await unauthenticated.admin(config.shop);
    const shopify = createShopifyGateway(admin.graphql);
    const pollDue =
      !settings.lastPolledAt ||
      Date.now() - settings.lastPolledAt.getTime() >= config.pollSeconds * 1000;
    if (
      settings.nextPollAttemptAt.getTime() <= Date.now() &&
      (settings.syncRequested || (settings.enabled && pollDue))
    ) {
      // A request submitted during the poll must remain pending for the next cycle.
      await db.shopSettings.update({
        where: { shop: config.shop },
        data: { syncRequested: false },
      });
      try {
        await importReadyRewards(config.shop, await superfiliate.listReady());
      } catch (error) {
        await db.shopSettings.updateMany({
          where: { shop: config.shop, uninstalledAt: null },
          data: {
            syncRequested: true,
            nextPollAttemptAt: new Date(Date.now() + 30_000),
          },
        });
        throw error;
      }
    }
    const records = await db.giftSync.findMany({
      where: {
        shop: config.shop,
        state: { not: "needs_review" },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: 20,
    });
    for (const record of records) {
      const active = await db.shopSettings.findUnique({
        where: { shop: config.shop },
      });
      if (active?.uninstalledAt) break;
      try {
        await processGift(
          {
            ...record,
            fulfillRequest: record.fulfillRequest
              ? shipmentSchema.parse(record.fulfillRequest)
              : null,
          },
          (patch) => saveGift(record.id, patch),
          shopify,
          superfiliate,
        );
        await db.giftSync.update({
          where: { id: record.id },
          data: { attempts: 0, lastError: null },
        });
        await db.giftSync.updateMany({
          where: { id: record.id, nextAttemptAt: record.nextAttemptAt },
          data: {
            nextAttemptAt: new Date(Date.now() + config.pollSeconds * 1000),
          },
        });
      } catch (error) {
        const review =
          error instanceof ReviewRequired || error instanceof ZodError;
        await db.giftSync.update({
          where: { id: record.id },
          data: {
            state: review ? "needs_review" : "retrying",
            lastError:
              error instanceof ZodError
                ? "Stored gift data is invalid; fetch the reward again before retrying."
                : error instanceof Error
                  ? error.message
                  : "Gift processing failed",
            attempts: { increment: 1 },
          },
        });
        await db.giftSync.updateMany({
          where: { id: record.id, nextAttemptAt: record.nextAttemptAt },
          data: {
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(3600, 30 * 2 ** Math.min(record.attempts, 7)) * 1000,
            ),
          },
        });
      }
    }
    await db.webhookReceipt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
    });
  } catch (error) {
    if (!locked) brokenConnection = true;
    const lastError = safeCycleError(error);
    await db.shopSettings.upsert({
      where: { shop: config.shop },
      create: { shop: config.shop, lastError },
      update: { lastError },
    });
    console.error(lastError);
  } finally {
    try {
      if (locked && !brokenConnection)
        await connection.query("SELECT pg_advisory_unlock(hashtext($1))", [
          lockKey,
        ]);
    } catch {
      brokenConnection = true;
    } finally {
      connection.removeListener("error", onConnectionError);
      connection.release(brokenConnection);
    }
  }
}
function safeCycleError(error: unknown) {
  return error instanceof ReviewRequired
    ? error.message
    : "Worker could not complete this cycle. Check connectivity, environment configuration and Shopify installation.";
}
export async function closeWorker() {
  await pool.end();
  await db.$disconnect();
}
