import { rewardSchema } from "./schemas";
import { z } from "zod";
import { getIntegrationConfig } from "./config.server";
import {
  RetryableError,
  ReviewRequired,
  type Shipment,
  type SuperfiliateGateway,
} from "./types";

export function createSuperfiliate(
  fetcher: typeof fetch = fetch,
): SuperfiliateGateway {
  const config = getIntegrationConfig();
  async function request(path: string, method = "GET", body?: Shipment) {
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.clientId}:${config.clientSecret}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
    } catch {
      throw new RetryableError(
        "Superfiliate request could not be completed; retry is safe",
      );
    }
    if (!response.ok) {
      const message = `Superfiliate returned HTTP ${response.status}`;
      if (response.status === 429 || response.status >= 500)
        throw new RetryableError(message);
      throw new ReviewRequired(
        `${message}. Check credential scopes, alpha access and reward state.`,
      );
    }
    return response;
  }
  return {
    async listReady() {
      const rewards = new Map<number, z.infer<typeof rewardSchema>>();
      for (const campaignId of config.campaignIds) {
        for (let page = 1; page <= 1000; page++) {
          const response = await request(
            `/gifting_rewards?gifting_stage=ready_to_send&campaign_id=${campaignId}&items=250&page=${page}`,
          );
          const batch = z.array(rewardSchema).parse(await response.json());
          for (const reward of batch) {
            if (
              reward.campaign.id !== campaignId ||
              reward.gifting_stage !== "ready_to_send"
            )
              throw new ReviewRequired(
                "Superfiliate returned a gift outside the requested campaign or stage",
              );
            rewards.set(reward.id, reward);
          }
          if (batch.length < 250) break;
          if (page === 1000)
            throw new ReviewRequired(
              "Pagination limit reached; narrow the campaign selection",
            );
        }
      }
      return [...rewards.values()];
    },
    async fulfill(id, shipment) {
      await request(`/gifting_rewards/${id}/fulfill`, "POST", shipment);
    },
    async updateTracking(id, shipment) {
      if (!config.trackingUpdatesEnabled)
        throw new ReviewRequired(
          "Tracking changed. Deploy the companion fulfillment-update endpoint, then enable SF_TRACKING_UPDATES_ENABLED and retry.",
        );
      await request(`/gifting_rewards/${id}/fulfillment`, "PATCH", shipment);
    },
  };
}
