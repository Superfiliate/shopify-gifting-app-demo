import { ReviewRequired, type Reward } from "./types";

export function rewardTag(id: number) {
  return `sf-gift-${id}`;
}
export function variantGid(id: string) {
  if (/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)) return id;
  if (/^\d+$/.test(id)) return `gid://shopify/ProductVariant/${id}`;
  throw new ReviewRequired(
    "Selected product does not have a Shopify variant ID. Configure an explicit product mapping before syncing this campaign.",
  );
}
export function draftInput(reward: Reward) {
  if (reward.gifting_stage !== "ready_to_send")
    throw new ReviewRequired("Gift is no longer ready to send");
  if (!reward.selected_products.length)
    throw new ReviewRequired("Gift has no selected products");
  const address = reward.shipping_address;
  if (
    !address.address1 ||
    !address.city ||
    !address.country_code ||
    !address.zip ||
    !reward.creator.first_name ||
    !reward.creator.last_name
  )
    throw new ReviewRequired("Gift is missing required shipping details");
  return {
    email: reward.creator.email,
    phone: reward.creator.phone || undefined,
    shippingAddress: {
      firstName: reward.creator.first_name,
      lastName: reward.creator.last_name,
      address1: address.address1,
      address2: address.address2 || undefined,
      city: address.city,
      countryCode: address.country_code,
      provinceCode: address.province_code || undefined,
      zip: address.zip,
      phone: reward.creator.phone || undefined,
    },
    lineItems: reward.selected_products.map((item) => ({
      variantId: variantGid(item.variant_external_id),
      quantity: item.quantity,
    })),
    appliedDiscount: {
      title: "Superfiliate gift",
      description: "Creator gifting",
      value: 100,
      valueType: "PERCENTAGE",
    },
    shippingLine: { title: "Gifting — free shipping", price: "0.00" },
    acceptAutomaticDiscounts: false,
    tags: ["superfiliate-gifting-demo", rewardTag(reward.id)],
    customAttributes: [
      { key: "superfiliate_reward_id", value: String(reward.id) },
      { key: "superfiliate_campaign_id", value: String(reward.campaign.id) },
    ],
  };
}
export function assertZeroTotal(total: string) {
  if (!/^0+(?:\.0+)?$/.test(total))
    throw new ReviewRequired(
      "Shopify calculated a non-zero total. Review the draft before completing this gift.",
    );
}
