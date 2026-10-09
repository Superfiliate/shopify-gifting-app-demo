export function getIntegrationConfig() {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN || "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
    throw new Error(
      "Set SHOPIFY_SHOP_DOMAIN to your store's myshopify.com domain",
    );
  const campaignIds = (process.env.SF_CAMPAIGN_IDS || "")
    .split(",")
    .filter(Boolean)
    .map((id) => Number(id.trim()));
  if (
    !campaignIds.length ||
    campaignIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error("Set SF_CAMPAIGN_IDS to the campaign IDs this app owns");
  const baseUrl = new URL(
    process.env.SF_BASE_URL || "https://api.superfiliate.com",
  );
  if (
    baseUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(baseUrl.hostname)
  )
    throw new Error("SF_BASE_URL must use HTTPS outside local development");
  if (
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.pathname !== "/"
  )
    throw new Error(
      "SF_BASE_URL must be an origin without a path or credentials",
    );
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("Set SF_CLIENT_ID and SF_CLIENT_SECRET");
  const pollSeconds = Number(process.env.POLL_INTERVAL_SECONDS || 300);
  if (!Number.isFinite(pollSeconds) || pollSeconds < 30)
    throw new Error("POLL_INTERVAL_SECONDS must be at least 30");
  return {
    shop,
    campaignIds,
    baseUrl: baseUrl.origin,
    clientId,
    clientSecret,
    pollSeconds,
    trackingUpdatesEnabled: process.env.SF_TRACKING_UPDATES_ENABLED === "true",
  };
}
