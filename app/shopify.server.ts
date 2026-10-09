import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const demo = process.env.DEMO_MODE === "true";
export const apiVersion = "2026-10" as ApiVersion;
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || (demo ? "fixture-demo" : ""),
  apiSecretKey:
    process.env.SHOPIFY_API_SECRET || (demo ? "fixture-demo-secret" : ""),
  apiVersion,
  appUrl: demo ? "http://localhost:3000" : process.env.SHOPIFY_APP_URL || "",
  scopes: process.env.SCOPES?.split(","),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.SingleMerchant,
  future: { expiringOfflineAccessTokens: true },
  hooks: {
    afterAuth: async ({ session }) => {
      assertConfiguredShop(session.shop);
      await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        create: { shop: session.shop },
        update: { uninstalledAt: null },
      });
    },
  },
});
export default shopify;
export const {
  authenticate,
  unauthenticated,
  login,
  sessionStorage,
  registerWebhooks,
  addDocumentResponseHeaders,
} = shopify;

export function assertConfiguredShop(shop: string) {
  if (demo || shop !== process.env.SHOPIFY_SHOP_DOMAIN) {
    throw new Response("This app is configured for a different store", {
      status: 403,
    });
  }
}
