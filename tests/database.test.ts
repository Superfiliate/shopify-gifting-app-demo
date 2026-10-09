import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureReward } from "../app/gifting/fixtures";
const mocks = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("../app/shopify.server", () => ({
  assertConfiguredShop: vi.fn(),
  unauthenticated: {
    admin: async () => ({ admin: { graphql: mocks.graphql } }),
  },
  authenticate: {
    webhook: async (request: Request) => ({
      shop: "fixture.myshopify.com",
      payload: await request.json(),
    }),
  },
}));

const run = process.env.RUN_DATABASE_TESTS === "true";
describe.skipIf(!run)("persisted worker lifecycle", () => {
  let db: typeof import("../app/db.server").default;
  let worker: typeof import("../app/gifting/worker.server");
  let webhook: typeof import("../app/routes/webhooks.shopify");
  const calls: { path: string; method: string; body: unknown }[] = [];
  let fulfilled = false;
  let tracked = false;
  const draft = {
    id: "gid://shopify/DraftOrder/1",
    order: null,
    totalPriceSet: { shopMoney: { amount: "0.00" } },
  };
  const order = { id: "gid://shopify/Order/1", name: "#1001" };
  beforeAll(async () => {
    vi.stubEnv("SF_TRACKING_UPDATES_ENABLED", "true");
    db = (await import("../app/db.server")).default;
    worker = await import("../app/gifting/worker.server");
    webhook = await import("../app/routes/webhooks.shopify");
    await db.giftSync.deleteMany({ where: { shop: "fixture.myshopify.com" } });
    await db.webhookReceipt.deleteMany({
      where: { shop: "fixture.myshopify.com" },
    });
    await db.shopSettings.upsert({
      where: { shop: "fixture.myshopify.com" },
      create: { shop: "fixture.myshopify.com", syncRequested: true },
      update: { syncRequested: true, uninstalledAt: null },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        calls.push({
          path: url,
          method: options?.method || "GET",
          body: options?.body ? JSON.parse(String(options.body)) : null,
        });
        return Response.json(options?.method === "GET" ? [fixtureReward] : {});
      }),
    );
    mocks.graphql.mockImplementation(async (query: string) => {
      if (query.includes("query GiftReference"))
        return Response.json({
          data: { draftOrders: { nodes: [] }, orders: { nodes: [] } },
        });
      if (query.includes("mutation CreateGift"))
        return Response.json({
          data: { draftOrderCreate: { draftOrder: draft, userErrors: [] } },
        });
      if (query.includes("query GiftDraft"))
        return Response.json({ data: { draftOrder: draft } });
      if (query.includes("mutation CompleteGift"))
        return Response.json({
          data: {
            draftOrderComplete: {
              draftOrder: { ...draft, order },
              userErrors: [],
            },
          },
        });
      return Response.json({
        data: {
          order: {
            ...order,
            cancelledAt: null,
            displayFulfillmentStatus: fulfilled ? "FULFILLED" : "UNFULFILLED",
            fulfillments: fulfilled
              ? [
                  {
                    status: "SUCCESS",
                    trackingInfo: [
                      {
                        company: "UPS",
                        number: tracked ? "TRACK-1" : null,
                        url: tracked ? "https://example.com/TRACK-1" : null,
                      },
                    ],
                  },
                ]
              : [],
          },
        },
      });
    });
  });
  afterAll(async () => {
    if (db) {
      await db.giftSync.deleteMany({
        where: { shop: "fixture.myshopify.com" },
      });
      await db.webhookReceipt.deleteMany({
        where: { shop: "fixture.myshopify.com" },
      });
      await db.shopSettings.deleteMany({
        where: { shop: "fixture.myshopify.com" },
      });
      await worker.closeWorker();
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("creates one order, consumes duplicate webhooks and adds tracking later", async () => {
    await worker.workerCycle();
    const created = await db.giftSync.findUniqueOrThrow({
      where: {
        shop_rewardId: {
          shop: "fixture.myshopify.com",
          rewardId: fixtureReward.id,
        },
      },
    });
    expect(created.orderId).toBe(order.id);
    expect(created.reward).toBeNull();
    expect(created.state).toBe("awaiting_fulfillment");
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    fulfilled = true;
    const deliver = () =>
      webhook.action({
        request: new Request("https://example.com/webhooks/shopify", {
          method: "POST",
          headers: { "X-Shopify-Webhook-Id": "fixture-event-1" },
          body: JSON.stringify({ order_id: "1" }),
        }),
        params: {},
        context: {},
        url: new URL("https://example.com/webhooks/shopify"),
        pattern: "/webhooks/shopify",
      });
    await deliver();
    await deliver();
    expect(
      await db.webhookReceipt.count({
        where: { shop: "fixture.myshopify.com" },
      }),
    ).toBe(1);
    await worker.workerCycle();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    tracked = true;
    await db.giftSync.update({
      where: { id: created.id },
      data: { nextAttemptAt: new Date() },
    });
    await worker.workerCycle();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      tracking_number: "TRACK-1",
    });
    expect(
      mocks.graphql.mock.calls.filter(([query]) =>
        query.includes("mutation CreateGift"),
      ),
    ).toHaveLength(1);
    expect(
      await db.giftSync.count({ where: { shop: "fixture.myshopify.com" } }),
    ).toBe(1);
  });
  it("retains a failed manual poll for retry while automatic imports are paused", async () => {
    await db.shopSettings.update({
      where: { shop: "fixture.myshopify.com" },
      data: {
        enabled: false,
        syncRequested: true,
        nextPollAttemptAt: new Date(0),
      },
    });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("temporary timeout"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await worker.workerCycle();
    log.mockRestore();
    const pending = await db.shopSettings.findUniqueOrThrow({
      where: { shop: "fixture.myshopify.com" },
    });
    expect(pending.syncRequested).toBe(true);
    expect(pending.nextPollAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await db.shopSettings.update({
      where: { shop: pending.shop },
      data: { nextPollAttemptAt: new Date(0) },
    });
    await worker.workerCycle();
    expect(
      (
        await db.shopSettings.findUniqueOrThrow({
          where: { shop: pending.shop },
        })
      ).syncRequested,
    ).toBe(false);
  });

  it("preserves a webhook wake arriving during order reconciliation", async () => {
    const record = await db.giftSync.findUniqueOrThrow({
      where: {
        shop_rewardId: {
          shop: "fixture.myshopify.com",
          rewardId: fixtureReward.id,
        },
      },
    });
    await db.giftSync.update({
      where: { id: record.id },
      data: { nextAttemptAt: new Date(0) },
    });
    mocks.graphql.mockImplementationOnce(async () => {
      await db.giftSync.update({
        where: { id: record.id },
        data: { nextAttemptAt: new Date() },
      });
      return Response.json({
        data: {
          order: {
            ...order,
            cancelledAt: null,
            displayFulfillmentStatus: "FULFILLED",
            fulfillments: [
              {
                status: "SUCCESS",
                trackingInfo: [
                  {
                    company: "UPS",
                    number: "TRACK-1",
                    url: "https://example.com/TRACK-1",
                  },
                ],
              },
            ],
          },
        },
      });
    });
    await worker.workerCycle();
    expect(
      (
        await db.giftSync.findUniqueOrThrow({ where: { id: record.id } })
      ).nextAttemptAt.getTime(),
    ).toBeLessThanOrEqual(Date.now());
  });

  it("restores unattempted redacted gifts without clearing creation safeguards", async () => {
    const { importReadyRewards } =
      await import("../app/gifting/import-rewards.server");
    const fresh = { ...fixtureReward, id: fixtureReward.id + 1 };
    const uncertain = { ...fixtureReward, id: fixtureReward.id + 2 };
    for (const reward of [fresh, uncertain]) {
      await db.giftSync.create({
        data: {
          shop: "fixture.myshopify.com",
          rewardId: reward.id,
          campaignId: reward.campaign.id,
          creatorName: "Removed creator",
          reward: { redacted: true },
          creationAttempted: reward.id === uncertain.id,
        },
      });
    }
    await importReadyRewards("fixture.myshopify.com", [fresh, uncertain]);
    const restored = await db.giftSync.findUniqueOrThrow({
      where: {
        shop_rewardId: { shop: "fixture.myshopify.com", rewardId: fresh.id },
      },
    });
    const guarded = await db.giftSync.findUniqueOrThrow({
      where: {
        shop_rewardId: {
          shop: "fixture.myshopify.com",
          rewardId: uncertain.id,
        },
      },
    });
    expect(restored.reward).toMatchObject({
      id: fresh.id,
      shipping_address: fresh.shipping_address,
    });
    expect(guarded.creationAttempted).toBe(true);
    expect(guarded.reward).toEqual({ redacted: true });
    await worker.saveGift(restored.id, { creationAttempted: true });
    await expect(
      worker.saveGift(restored.id, { creationAttempted: true }),
    ).rejects.toThrow("already claimed");
    await db.shopSettings.update({
      where: { shop: "fixture.myshopify.com" },
      data: { uninstalledAt: new Date() },
    });
    await db.giftSync.update({
      where: { id: restored.id },
      data: { reward: { redacted: true }, creationAttempted: false },
    });
    await importReadyRewards("fixture.myshopify.com", [fresh]);
    expect(
      (await db.giftSync.findUniqueOrThrow({ where: { id: restored.id } }))
        .reward,
    ).toEqual({ redacted: true });
  });
  it("releases a checked-out connection when lock acquisition fails", async () => {
    const { Pool } = await import("pg");
    const external = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const client = await external.connect();
    const query = vi
      .spyOn(client, "query")
      .mockRejectedValueOnce(new Error("lock connection interrupted"));
    const release = vi.spyOn(client, "release");
    const connect = vi
      .spyOn(Pool.prototype, "connect")
      .mockImplementationOnce(async () => client);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await worker.workerCycle();
      expect(release).toHaveBeenCalledWith(true);
    } finally {
      connect.mockRestore();
      query.mockRestore();
      release.mockRestore();
      log.mockRestore();
      await external.end();
    }
  });
});
