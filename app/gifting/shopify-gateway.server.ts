import { draftInput, rewardTag } from "./draft";
import {
  AmbiguousCreation,
  ReviewRequired,
  RetryableError,
  type Draft,
  type OrderSnapshot,
  type ShopifyGateway,
} from "./types";

type Graphql = (
  query: string,
  options?: {
    variables?: Record<string, unknown>;
    tries?: number;
    signal?: AbortSignal;
  },
) => Promise<Response>;
type DraftNode = {
  id: string;
  order: { id: string; name: string } | null;
  totalPriceSet: { shopMoney: { amount: string } };
};
const DRAFT_FIELDS =
  "id order { id name } totalPriceSet { shopMoney { amount } }";
function draft(node: DraftNode): Draft {
  return {
    id: node.id,
    order: node.order,
    total: node.totalPriceSet.shopMoney.amount,
  };
}

export function createShopifyGateway(graphql: Graphql): ShopifyGateway {
  async function query<T>(
    document: string,
    variables: Record<string, unknown>,
    creating = false,
  ): Promise<T> {
    try {
      const response = await graphql(document, {
        variables,
        tries: 1,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (creating)
          throw new AmbiguousCreation(
            "Draft creation returned an uncertain response. Reconcile Shopify before retrying.",
          );
        throw new RetryableError(`Shopify returned HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        data?: T;
        errors?: unknown[];
      };
      if (result.errors?.length || !result.data) {
        if (creating)
          throw new AmbiguousCreation(
            "Draft creation returned an uncertain response. Reconcile Shopify before retrying.",
          );
        throw new RetryableError(
          "Shopify GraphQL request failed; check scopes and the pinned API version",
        );
      }
      return result.data;
    } catch (error) {
      if (error instanceof ReviewRequired || error instanceof RetryableError)
        throw error;
      if (creating)
        throw new AmbiguousCreation(
          "Draft creation was interrupted. Reconcile Shopify before retrying.",
        );
      throw new RetryableError("Shopify request was interrupted");
    }
  }
  function assertMutation(payload: { userErrors: { message: string }[] }) {
    if (payload.userErrors.length)
      throw new ReviewRequired(
        "Shopify rejected the draft operation. Review product availability, address and permissions in Shopify.",
      );
  }
  return {
    async findByReward(rewardId) {
      const found = await query<{
        draftOrders: { nodes: DraftNode[] };
        orders: { nodes: { id: string; name: string }[] };
      }>(
        `query GiftReference($query: String!) { draftOrders(first: 2, query: $query) { nodes { ${DRAFT_FIELDS} } } orders(first: 2, query: $query) { nodes { id name } } }`,
        { query: `tag:${rewardTag(rewardId)}` },
      );
      if (found.draftOrders.nodes.length > 1 || found.orders.nodes.length > 1)
        throw new ReviewRequired(
          "Multiple Shopify records match this reward; resolve the duplicates manually",
        );
      const matchedDraft = found.draftOrders.nodes[0];
      const matchedOrder = found.orders.nodes[0] || matchedDraft?.order || null;
      if (
        matchedDraft &&
        matchedOrder &&
        matchedDraft.order?.id !== matchedOrder.id
      )
        throw new ReviewRequired(
          "Draft and order references disagree; review the Shopify records",
        );
      return {
        draft: matchedDraft ? draft(matchedDraft) : null,
        order: matchedOrder,
      };
    },
    async createDraft(reward) {
      const input = draftInput(reward);
      const { draftOrderCreate } = await query<{
        draftOrderCreate: {
          draftOrder: DraftNode | null;
          userErrors: { message: string }[];
        };
      }>(
        `mutation CreateGift($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { ${DRAFT_FIELDS} } userErrors { message } } }`,
        { input },
        true,
      );
      assertMutation(draftOrderCreate);
      if (!draftOrderCreate.draftOrder)
        throw new AmbiguousCreation(
          "Shopify did not return a draft ID. Reconcile before creating another draft.",
        );
      return draft(draftOrderCreate.draftOrder);
    },
    async getDraft(id) {
      const { draftOrder } = await query<{ draftOrder: DraftNode | null }>(
        `query GiftDraft($id: ID!) { draftOrder(id: $id) { ${DRAFT_FIELDS} } }`,
        { id },
      );
      if (!draftOrder)
        throw new ReviewRequired(
          "Saved Shopify draft no longer exists; review manually",
        );
      return draft(draftOrder);
    },
    async completeDraft(id) {
      const { draftOrderComplete } = await query<{
        draftOrderComplete: {
          draftOrder: DraftNode | null;
          userErrors: { message: string }[];
        };
      }>(
        `mutation CompleteGift($id: ID!) { draftOrderComplete(id: $id) { draftOrder { ${DRAFT_FIELDS} } userErrors { message } } }`,
        { id },
      );
      assertMutation(draftOrderComplete);
      if (!draftOrderComplete.draftOrder?.order)
        throw new RetryableError(
          "Draft completion did not return an order; reconcile the saved draft",
        );
      return draftOrderComplete.draftOrder.order;
    },
    async getOrder(id): Promise<OrderSnapshot> {
      const { order } = await query<{
        order: null | {
          id: string;
          name: string;
          cancelledAt: string | null;
          displayFulfillmentStatus: string;
          fulfillments: {
            status: string;
            trackingInfo: {
              company: string | null;
              number: string | null;
              url: string | null;
            }[];
          }[];
        };
      }>(
        `query GiftShipment($id: ID!) { order(id: $id) { id name cancelledAt displayFulfillmentStatus fulfillments(first: 250) { status trackingInfo { company number url } } } }`,
        { id },
      );
      if (!order)
        throw new ReviewRequired(
          "Saved Shopify order is unavailable; check order access and retention",
        );
      const successful = order.fulfillments.filter(
        (item) => item.status === "SUCCESS",
      );
      return {
        id: order.id,
        name: order.name,
        cancelled: !!order.cancelledAt,
        fullyFulfilled:
          order.displayFulfillmentStatus === "FULFILLED" &&
          successful.length > 0,
        shipments: successful.flatMap((item) =>
          (item.trackingInfo.length
            ? item.trackingInfo
            : [{ company: null, number: null, url: null }]
          ).map((tracking) => ({
            external_order_id: order.id,
            carrier: tracking.company || null,
            tracking_number: tracking.number || null,
            tracking_url: tracking.url || null,
          })),
        ),
      };
    },
  };
}
