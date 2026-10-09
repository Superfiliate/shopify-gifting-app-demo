import db from "../db.server";
import { getIntegrationConfig } from "./config.server";
import { decryptCredentials } from "./credentials.server";

export async function getShopIntegrationConfig(shop: string) {
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const credentials = settings?.encryptedCredentials
    ? decryptCredentials(shop, settings.encryptedCredentials)
    : {};
  return getIntegrationConfig({
    ...credentials,
    campaignIds: settings?.campaignIds ?? undefined,
  });
}
