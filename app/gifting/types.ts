import type { z } from "zod";
import type { rewardSchema } from "./schemas";

export type Reward = z.infer<typeof rewardSchema>;
export interface Shipment {
  external_order_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}
export interface OrderSnapshot {
  id: string;
  name: string;
  cancelled: boolean;
  fullyFulfilled: boolean;
  shipments: Shipment[];
}
export interface Draft {
  id: string;
  order: { id: string; name: string } | null;
  total: string;
}
export interface ShopifyGateway {
  findByReward(rewardId: number): Promise<{
    draft: Draft | null;
    order: { id: string; name: string } | null;
  }>;
  createDraft(reward: Reward): Promise<Draft>;
  getDraft(id: string): Promise<Draft>;
  completeDraft(id: string): Promise<{ id: string; name: string }>;
  getOrder(id: string): Promise<OrderSnapshot>;
}
export interface SuperfiliateGateway {
  listReady(): Promise<Reward[]>;
  fulfill(rewardId: number, shipment: Shipment): Promise<void>;
  updateTracking(rewardId: number, shipment: Shipment): Promise<void>;
}
export class ReviewRequired extends Error {}
export class RetryableError extends Error {}
export class AmbiguousCreation extends ReviewRequired {}
