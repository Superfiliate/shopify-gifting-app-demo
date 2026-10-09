import type { Reward } from "./types";
export const fixtureReward: Reward = {
  id: 123456,
  gifting_stage: "ready_to_send",
  campaign: { id: 345678, name: "Summer creator gifting" },
  creator: {
    id: 789012,
    first_name: "Alex",
    last_name: "Creator",
    email: "alex@example.com",
    phone: "+15555550123",
  },
  shipping_address: {
    address1: "123 Example St",
    address2: "Apt 4",
    city: "New York",
    country_code: "US",
    province_code: "NY",
    zip: "10001",
  },
  selected_products: [
    {
      variant_external_id: "43729076",
      product_title: "Creator coffee bundle",
      variant_title: "Dark roast",
      quantity: 1,
    },
  ],
  updated_at: "2026-08-11T18:00:00Z",
};
