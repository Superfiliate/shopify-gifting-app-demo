import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      SHOPIFY_SHOP_DOMAIN: "fixture.myshopify.com",
      SF_CLIENT_ID: "sfci1_fixture",
      SF_CLIENT_SECRET: "sfcs1_fixture",
      SF_CAMPAIGN_IDS: "345678",
    },
  },
});
