import { z } from "zod";

export const rewardSchema = z.object({
  id: z.number().int().positive(),
  gifting_stage: z.string(),
  campaign: z.object({ id: z.number().int().positive(), name: z.string() }),
  creator: z.object({
    id: z.number().int(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  shipping_address: z.object({
    address1: z.string(),
    address2: z.string().nullable().optional(),
    city: z.string(),
    country_code: z.string(),
    province_code: z.string().nullable().optional(),
    zip: z.string(),
  }),
  selected_products: z.array(
    z.object({
      variant_external_id: z.string(),
      product_title: z.string(),
      variant_title: z.string(),
      quantity: z.number().int().positive(),
    }),
  ),
  updated_at: z.string(),
});
export const shipmentSchema = z.object({
  external_order_id: z.string(),
  carrier: z.string().nullable(),
  tracking_number: z.string().nullable(),
  tracking_url: z.string().nullable(),
});
