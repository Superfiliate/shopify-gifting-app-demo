import { rewardSchema } from "./schemas";
import { assertZeroTotal, draftInput } from "./draft";
import {
  AmbiguousCreation,
  ReviewRequired,
  type Shipment,
  type ShopifyGateway,
  type SuperfiliateGateway,
} from "./types";

export interface GiftRecord {
  id: string;
  rewardId: number;
  reward: unknown;
  draftOrderId: string | null;
  orderId: string | null;
  orderName: string | null;
  creationAttempted: boolean;
  fulfillRequest: Shipment | null;
  fulfilled: boolean;
  lastSyncedShipment: string | null;
}
export type SaveGift = (
  patch: Partial<GiftRecord> & { state?: string; shipment?: Shipment },
) => Promise<void>;

export async function processGift(
  record: GiftRecord,
  save: SaveGift,
  shopify: ShopifyGateway,
  superfiliate: SuperfiliateGateway,
) {
  async function persist(patch: Parameters<SaveGift>[0]) {
    await save(patch);
    Object.assign(record, patch);
  }
  if (!record.orderId) {
    if (!record.draftOrderId) {
      const existing = await shopify.findByReward(record.rewardId);
      if (existing.order)
        await persist({
          orderId: existing.order.id,
          orderName: existing.order.name,
          state: "order_created",
          reward: null,
        });
      else if (existing.draft)
        await persist({
          draftOrderId: existing.draft.id,
          state: "draft_created",
        });
      else {
        if (record.creationAttempted)
          throw new ReviewRequired(
            "A prior draft creation has an uncertain outcome. Reconcile Shopify using this reward's tag; automatic recreation is blocked.",
          );
        const reward = rewardSchema.parse(record.reward);
        draftInput(reward);
        await persist({ creationAttempted: true, state: "creating_draft" });
        let created;
        try {
          created = await shopify.createDraft(reward);
        } catch (error) {
          if (
            error instanceof ReviewRequired &&
            !(error instanceof AmbiguousCreation)
          )
            await persist({ creationAttempted: false });
          throw error;
        }
        await persist({ draftOrderId: created.id, state: "draft_created" });
      }
    }
    if (!record.orderId) {
      const current = await shopify.getDraft(record.draftOrderId!);
      let order = current.order;
      if (!order) {
        assertZeroTotal(current.total);
        order = await shopify.completeDraft(current.id);
      }
      await persist({
        orderId: order.id,
        orderName: order.name,
        state: "order_created",
        reward: null,
      });
    }
  }
  const order = await shopify.getOrder(record.orderId!);
  if (order.cancelled)
    throw new ReviewRequired(
      "Shopify order was cancelled. Review the gift in Superfiliate; do not automatically recreate it.",
    );
  if (!order.fullyFulfilled) {
    await persist({ state: "awaiting_fulfillment" });
    return;
  }
  if (order.shipments.length !== 1)
    throw new ReviewRequired(
      "This gift has multiple shipments. The sample supports one tracking record; reconcile this gift manually.",
    );
  const shipment = order.shipments[0];
  const fingerprint = JSON.stringify(shipment);
  await persist({ shipment, state: "syncing_shipment" });
  if (!record.fulfilled) {
    if (!record.fulfillRequest) await persist({ fulfillRequest: shipment });
    const request = record.fulfillRequest!;
    await superfiliate.fulfill(record.rewardId, request);
    await persist({
      fulfilled: true,
      lastSyncedShipment: JSON.stringify(request),
    });
  }
  if (record.lastSyncedShipment !== fingerprint) {
    await superfiliate.updateTracking(record.rewardId, shipment);
    await persist({ lastSyncedShipment: fingerprint });
  }
  await persist({ state: "synced" });
}
