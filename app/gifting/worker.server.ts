import { shipmentSchema } from "./schemas";
import { Pool } from "pg";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { assertConfiguredShop, unauthenticated } from "../shopify.server";
import { getIntegrationConfig } from "./config.server";
import { createSuperfiliate } from "./superfiliate.server";
import { createShopifyGateway } from "./shopify-gateway.server";
import { processGift } from "./process-gift";
import { ReviewRequired } from "./types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
export async function workerCycle() {
  const config = getIntegrationConfig();
  const connection = await pool.connect();
  const lockKey = `gifting:${config.shop}`;
  const lock = await connection.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [lockKey],
  );
  if (!lock.rows[0].locked) {
    connection.release();
    return;
  }
  try {
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
    if (settings.syncRequested || (settings.enabled && pollDue)) {
      // Claim the request before polling so a new request during the poll remains pending.
      await db.shopSettings.update({
        where: { shop: config.shop },
        data: { syncRequested: false },
      });
      const rewards = await superfiliate.listReady();
      for (const reward of rewards) {
        await db.giftSync.upsert({
          where: { shop_rewardId: { shop: config.shop, rewardId: reward.id } },
          create: {
            shop: config.shop,
            rewardId: reward.id,
            campaignId: reward.campaign.id,
            creatorName: `${reward.creator.first_name} ${reward.creator.last_name}`,
            reward,
          },
          update: {},
        });
      }
      await db.shopSettings.update({
        where: { shop: config.shop },
        data: { lastPolledAt: new Date(), lastError: null },
      });
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
          async (patch) => {
            const { reward, shipment, fulfillRequest, ...data } = patch;
            await db.giftSync.update({
              where: { id: record.id },
              data: {
                ...data,
                ...(reward === null ? { reward: Prisma.DbNull } : {}),
                ...(shipment ? { shipment: { ...shipment } } : {}),
                ...(fulfillRequest
                  ? { fulfillRequest: { ...fulfillRequest } }
                  : {}),
              },
            });
          },
          shopify,
          superfiliate,
        );
        await db.giftSync.update({
          where: { id: record.id },
          data: {
            attempts: 0,
            lastError: null,
            nextAttemptAt: new Date(Date.now() + config.pollSeconds * 1000),
          },
        });
      } catch (error) {
        const review = error instanceof ReviewRequired;
        await db.giftSync.update({
          where: { id: record.id },
          data: {
            state: review ? "needs_review" : "retrying",
            lastError:
              error instanceof Error ? error.message : "Gift processing failed",
            attempts: { increment: 1 },
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
    await db.shopSettings.upsert({
      where: { shop: config.shop },
      create: { shop: config.shop, lastError: safeCycleError(error) },
      update: { lastError: safeCycleError(error) },
    });
    console.error(safeCycleError(error));
  } finally {
    await connection.query("SELECT pg_advisory_unlock(hashtext($1))", [
      lockKey,
    ]);
    connection.release();
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
