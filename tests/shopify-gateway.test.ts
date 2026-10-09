import { describe, expect, it, vi } from "vitest";
import { createShopifyGateway } from "../app/gifting/shopify-gateway.server";
import { fixtureReward } from "../app/gifting/fixtures";

describe("Shopify boundary", () => {
  it("makes a single bounded creation request with the zero-price gift input", async () => {
    const graphql = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          draftOrderCreate: {
            draftOrder: {
              id: "gid://shopify/DraftOrder/1",
              order: null,
              totalPriceSet: { shopMoney: { amount: "0.00" } },
            },
            userErrors: [],
          },
        },
      }),
    );
    const result =
      await createShopifyGateway(graphql).createDraft(fixtureReward);
    expect(result.total).toBe("0.00");
    expect(graphql).toHaveBeenCalledOnce();
    expect(graphql.mock.calls[0][1]).toMatchObject({
      tries: 1,
      variables: {
        input: { tags: ["superfiliate-gifting-demo", "sf-gift-123456"] },
      },
    });
  });
  it("treats a network interruption during creation as an ambiguous outcome", async () => {
    const graphql = vi.fn().mockRejectedValue(new Error("socket closed"));
    await expect(
      createShopifyGateway(graphql).createDraft(fixtureReward),
    ).rejects.toThrow("Reconcile Shopify");
    expect(graphql).toHaveBeenCalledOnce();
  });
  it("rejects duplicate order references", async () => {
    const graphql = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          draftOrders: { nodes: [] },
          orders: {
            nodes: [
              { id: "1", name: "#1" },
              { id: "2", name: "#2" },
            ],
          },
        },
      }),
    );
    await expect(createShopifyGateway(graphql).findByReward(1)).rejects.toThrow(
      "Multiple Shopify records",
    );
  });
  it("ignores failed fulfillments when extracting shipment data", async () => {
    const graphql = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          order: {
            id: "gid://shopify/Order/1",
            name: "#1",
            cancelledAt: null,
            displayFulfillmentStatus: "FULFILLED",
            fulfillments: [
              { status: "FAILURE", trackingInfo: [{ number: "INVALID" }] },
            ],
          },
        },
      }),
    );
    const snapshot = await createShopifyGateway(graphql).getOrder(
      "gid://shopify/Order/1",
    );
    expect(snapshot.fullyFulfilled).toBe(false);
    expect(snapshot.shipments).toEqual([]);
  });
});
