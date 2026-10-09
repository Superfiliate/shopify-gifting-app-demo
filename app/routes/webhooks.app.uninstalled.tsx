import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { assertConfiguredShop, authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);
  assertConfiguredShop(shop);
  await db.$transaction([
    db.shopSettings.upsert({
      where: { shop },
      create: { shop, uninstalledAt: new Date() },
      update: {
        enabled: false,
        syncRequested: false,
        uninstalledAt: new Date(),
      },
    }),
    db.session.deleteMany({ where: { shop } }),
    db.giftSync.updateMany({
      where: { shop },
      data: { reward: { redacted: true }, creatorName: "Removed creator" },
    }),
  ]);
  return new Response();
}
