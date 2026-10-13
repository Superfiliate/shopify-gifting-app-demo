import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { assertConfiguredShop, authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload } = await authenticate.webhook(request);
  assertConfiguredShop(shop);
  const deliveryId = request.headers.get("X-Shopify-Webhook-Id");
  const numericId = String(payload.order_id || payload.id || "");
  if (!deliveryId || !/^\d+$/.test(numericId))
    return new Response("Invalid delivery", { status: 400 });
  const orderId = `gid://shopify/Order/${numericId}`;
  try {
    await db.$transaction(async (transaction) => {
      await transaction.webhookReceipt.create({
        data: { id: deliveryId, shop, orderId },
      });
      await transaction.giftSync.updateMany({
        where: { shop, orderId, state: { not: "needs_review" } },
        data: { nextAttemptAt: new Date() },
      });
    });
  } catch (error) {
    if (!(
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ))
      throw error;
  }
  return new Response(null, { status: 200 });
}
