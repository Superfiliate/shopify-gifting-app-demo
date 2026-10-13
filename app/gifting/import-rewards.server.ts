import db from "../db.server";
import type { Reward } from "./types";

export async function importReadyRewards(shop: string, rewards: Reward[]) {
  return db.$transaction(
    async (transaction) => {
      const active = await transaction.shopSettings.updateMany({
        where: { shop, uninstalledAt: null },
        data: { lastPolledAt: new Date(), lastError: null },
      });
      if (!active.count) return;
      for (const reward of rewards) {
        const creatorName = `${reward.creator.first_name} ${reward.creator.last_name}`;
        const key = { shop, rewardId: reward.id };
        await transaction.giftSync.upsert({
          where: { shop_rewardId: key },
          create: {
            ...key,
            campaignId: reward.campaign.id,
            creatorName,
            reward,
          },
          update: {},
        });
        const unattempted = {
          ...key,
          draftOrderId: null,
          orderId: null,
          creationAttempted: false,
        };
        await transaction.giftSync.updateMany({
          where: {
            ...unattempted,
            reward: { path: ["redacted"], equals: true },
          },
          data: { state: "queued", nextAttemptAt: new Date(), lastError: null },
        });
        await transaction.giftSync.updateMany({
          where: unattempted,
          data: { reward, creatorName },
        });
      }
    },
    { timeout: 30_000 },
  );
}
