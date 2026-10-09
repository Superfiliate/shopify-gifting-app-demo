import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureReward } from "../app/gifting/fixtures";
import {
  processGift,
  type GiftRecord,
  type SaveGift,
} from "../app/gifting/process-gift";
import { draftInput, assertZeroTotal, variantGid } from "../app/gifting/draft";
import {
  AmbiguousCreation,
  RetryableError,
  type Shipment,
  type ShopifyGateway,
  type SuperfiliateGateway,
} from "../app/gifting/types";

const order = { id: "gid://shopify/Order/1", name: "#1001" };
const shipment: Shipment = {
  external_order_id: order.id,
  carrier: "UPS",
  tracking_number: "TRACK-1",
  tracking_url: "https://example.com/TRACK-1",
};
let record: GiftRecord;
let shopify: ShopifyGateway;
let superfiliate: SuperfiliateGateway;
let save: SaveGift;
beforeEach(() => {
  record = {
    id: "sync-1",
    rewardId: fixtureReward.id,
    reward: fixtureReward,
    draftOrderId: null,
    orderId: null,
    orderName: null,
    creationAttempted: false,
    fulfillRequest: null,
    fulfilled: false,
    lastSyncedShipment: null,
  };
  shopify = {
    findByReward: vi.fn().mockResolvedValue({ draft: null, order: null }),
    createDraft: vi.fn().mockResolvedValue({
      id: "gid://shopify/DraftOrder/1",
      order: null,
      total: "0.00",
    }),
    getDraft: vi.fn().mockResolvedValue({
      id: "gid://shopify/DraftOrder/1",
      order: null,
      total: "0.00",
    }),
    completeDraft: vi.fn().mockResolvedValue(order),
    getOrder: vi.fn().mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: false,
      shipments: [],
    }),
  };
  superfiliate = {
    listReady: vi.fn(),
    fulfill: vi.fn().mockResolvedValue(undefined),
    updateTracking: vi.fn().mockResolvedValue(undefined),
  };
  save = vi.fn(async (patch) => {
    Object.assign(record, patch);
  });
});
describe("gift lifecycle", () => {
  it("creates a warehouse-ready order without prematurely marking shipped", async () => {
    await processGift(record, save, shopify, superfiliate);
    expect(shopify.createDraft).toHaveBeenCalledOnce();
    expect(shopify.completeDraft).toHaveBeenCalledOnce();
    expect(record.orderId).toBe(order.id);
    expect(record.reward).toBeNull();
    expect(superfiliate.fulfill).not.toHaveBeenCalled();
    expect(save).toHaveBeenLastCalledWith({ state: "awaiting_fulfillment" });
  });
  it("repeated imports never create another order", async () => {
    await processGift(record, save, shopify, superfiliate);
    await processGift(record, save, shopify, superfiliate);
    expect(shopify.createDraft).toHaveBeenCalledOnce();
    expect(shopify.completeDraft).toHaveBeenCalledOnce();
  });
  it("recovers a draft after creation succeeded but saving its ID failed", async () => {
    record.creationAttempted = true;
    vi.mocked(shopify.findByReward).mockResolvedValue({
      draft: { id: "gid://shopify/DraftOrder/1", order: null, total: "0.00" },
      order: null,
    });
    await processGift(record, save, shopify, superfiliate);
    expect(shopify.createDraft).not.toHaveBeenCalled();
    expect(record.orderId).toBe(order.id);
  });
  it("blocks recreation when an interrupted creation cannot be reconciled", async () => {
    record.creationAttempted = true;
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("uncertain outcome");
    expect(shopify.createDraft).not.toHaveBeenCalled();
  });
  it("retains the creation guard after a Shopify transport failure", async () => {
    vi.mocked(shopify.createDraft).mockRejectedValue(
      new AmbiguousCreation("timeout"),
    );
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("timeout");
    expect(record.creationAttempted).toBe(true);
  });
  it("recovers completion from a saved draft without completing again", async () => {
    record.draftOrderId = "gid://shopify/DraftOrder/1";
    vi.mocked(shopify.getDraft).mockResolvedValue({
      id: record.draftOrderId,
      order,
      total: "0.00",
    });
    await processGift(record, save, shopify, superfiliate);
    expect(shopify.createDraft).not.toHaveBeenCalled();
    expect(shopify.completeDraft).not.toHaveBeenCalled();
  });
  it("leaves a draft open if Shopify calculates a non-zero total", async () => {
    vi.mocked(shopify.getDraft).mockResolvedValue({
      id: "gid://shopify/DraftOrder/1",
      order: null,
      total: "4.99",
    });
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("non-zero total");
    expect(shopify.completeDraft).not.toHaveBeenCalled();
  });
  it("marks shipped only after the entire order is fulfilled", async () => {
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: true,
      shipments: [shipment],
    });
    await processGift(record, save, shopify, superfiliate);
    expect(superfiliate.fulfill).toHaveBeenCalledWith(
      fixtureReward.id,
      shipment,
    );
    await processGift(record, save, shopify, superfiliate);
    expect(superfiliate.fulfill).toHaveBeenCalledOnce();
    expect(superfiliate.updateTracking).not.toHaveBeenCalled();
  });
  it("syncs tracking added after fulfillment", async () => {
    record.orderId = order.id;
    record.fulfilled = true;
    record.lastSyncedShipment = JSON.stringify({
      ...shipment,
      tracking_number: null,
      tracking_url: null,
    });
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: true,
      shipments: [shipment],
    });
    await processGift(record, save, shopify, superfiliate);
    expect(superfiliate.fulfill).not.toHaveBeenCalled();
    expect(superfiliate.updateTracking).toHaveBeenCalledWith(
      fixtureReward.id,
      shipment,
    );
  });
  it("retries the identical initial fulfillment payload even if tracking changes", async () => {
    const initial = { ...shipment, tracking_number: null, tracking_url: null };
    record.orderId = order.id;
    record.fulfillRequest = initial;
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: true,
      shipments: [shipment],
    });
    await processGift(record, save, shopify, superfiliate);
    expect(superfiliate.fulfill).toHaveBeenCalledWith(
      fixtureReward.id,
      initial,
    );
    expect(superfiliate.updateTracking).toHaveBeenCalledWith(
      fixtureReward.id,
      shipment,
    );
  });
  it("retries Superfiliate failures without creating another Shopify order", async () => {
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: true,
      shipments: [shipment],
    });
    vi.mocked(superfiliate.fulfill).mockRejectedValueOnce(
      new RetryableError("unavailable"),
    );
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("unavailable");
    await processGift(record, save, shopify, superfiliate);
    expect(shopify.createDraft).toHaveBeenCalledOnce();
    expect(superfiliate.fulfill).toHaveBeenCalledTimes(2);
  });
  it("does not mark a partially fulfilled order shipped", async () => {
    record.orderId = order.id;
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: false,
      shipments: [shipment],
    });
    await processGift(record, save, shopify, superfiliate);
    expect(superfiliate.fulfill).not.toHaveBeenCalled();
  });
  it("requires review for multiple shipments instead of losing tracking", async () => {
    record.orderId = order.id;
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: false,
      fullyFulfilled: true,
      shipments: [shipment, { ...shipment, tracking_number: "TRACK-2" }],
    });
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("multiple shipments");
    expect(superfiliate.fulfill).not.toHaveBeenCalled();
  });
  it("never recreates a cancelled gift order", async () => {
    record.orderId = order.id;
    vi.mocked(shopify.getOrder).mockResolvedValue({
      ...order,
      cancelled: true,
      fullyFulfilled: false,
      shipments: [],
    });
    await expect(
      processGift(record, save, shopify, superfiliate),
    ).rejects.toThrow("cancelled");
    expect(shopify.createDraft).not.toHaveBeenCalled();
  });
});
describe("draft policy", () => {
  it("uses real variants, free shipping and a 100% discount", () => {
    expect(draftInput(fixtureReward)).toMatchObject({
      shippingLine: { price: "0.00" },
      appliedDiscount: { value: 100, valueType: "PERCENTAGE" },
      lineItems: [
        { variantId: "gid://shopify/ProductVariant/43729076", quantity: 1 },
      ],
    });
    expect(draftInput(fixtureReward)).not.toHaveProperty("taxExempt");
    expect(variantGid("gid://shopify/ProductVariant/42")).toBe(
      "gid://shopify/ProductVariant/42",
    );
    expect(() => variantGid("some-sku")).toThrow("explicit product mapping");
    expect(() => assertZeroTotal("NaN")).toThrow();
  });
});
