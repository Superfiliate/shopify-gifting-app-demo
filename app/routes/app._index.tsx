import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";
import db from "../db.server";
import { assertConfiguredShop, authenticate } from "../shopify.server";
import { getIntegrationConfig } from "../gifting/config.server";
import { getShopIntegrationConfig } from "../gifting/settings.server";
import {
  decryptCredentials,
  encryptCredentials,
} from "../gifting/credentials.server";
import { createSuperfiliate } from "../gifting/superfiliate.server";
import { shipmentSchema } from "../gifting/schemas";
import { ReviewRequired } from "../gifting/types";
import { GiftingDashboard } from "../components/gifting-dashboard";
import "../styles/dashboard.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  assertConfiguredShop(session.shop);
  const [settings, records] = await Promise.all([
    db.shopSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop },
      update: {},
    }),
    db.giftSync.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rewardId: true,
        creatorName: true,
        state: true,
        orderId: true,
        orderName: true,
        fulfilled: true,
        shipment: true,
        lastError: true,
      },
    }),
  ]);
  let configured = true;
  try {
    await getShopIntegrationConfig(session.shop);
  } catch {
    configured = false;
  }
  return {
    shop: session.shop,
    configured,
    campaigns: settings.campaignIds ?? process.env.SF_CAMPAIGN_IDS ?? "",
    credentialsSaved:
      !!settings.encryptedCredentials ||
      !!(process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET),
    enabled: settings.enabled,
    automaticOrders: settings.automaticOrders,
    syncRequested: settings.syncRequested,
    lastFetched: settings.lastPolledAt?.toISOString() ?? null,
    error: settings.lastError,
    trackingEnabled: process.env.SF_TRACKING_UPDATES_ENABLED === "true",
    records: records.map(({ shipment, ...record }) => ({
      ...record,
      trackingNumber:
        shipmentSchema.safeParse(shipment).data?.tracking_number ?? null,
    })),
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  assertConfiguredShop(session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  const existing = await db.shopSettings.findUnique({
    where: { shop: session.shop },
  });
  if (existing?.uninstalledAt)
    return {
      error: "Reinstall this app before resuming the connection.",
      message: null,
    };
  if (intent === "settings") {
    const clientId = String(form.get("clientId") || "").trim();
    const clientSecret = String(form.get("clientSecret") || "").trim();
    if (!!clientId !== !!clientSecret)
      return {
        error:
          "Enter both the client ID and client secret to replace credentials, or leave both blank to keep them.",
        message: null,
      };
    try {
      const credentials =
        clientId && clientSecret
          ? { clientId, clientSecret }
          : existing?.encryptedCredentials
            ? decryptCredentials(session.shop, existing.encryptedCredentials)
            : {};
      const campaignIds = String(form.get("campaignIds") || "").trim();
      const config = getIntegrationConfig({ ...credentials, campaignIds });
      await createSuperfiliate(fetch, config).listReady();
      const encryptedCredentials = clientId
        ? encryptCredentials(session.shop, { clientId, clientSecret })
        : undefined;
      const data = {
        campaignIds,
        encryptedCredentials,
        enabled: form.get("enabled") === "on",
        automaticOrders: form.get("automaticOrders") === "on",
      };
      await db.shopSettings.upsert({
        where: { shop: session.shop },
        create: { shop: session.shop, ...data },
        update: { ...data, lastError: null },
      });
      return { error: null, message: "Connection verified. Settings saved." };
    } catch (error) {
      return {
        error:
          error instanceof ReviewRequired
            ? error.message
            : "Connection could not be verified. Check the credentials, campaign IDs and API access.",
        message: null,
      };
    }
  }
  let config;
  try {
    config = await getShopIntegrationConfig(session.shop);
  } catch {
    return { error: "Complete quick settings first.", message: null };
  }
  if (intent === "retry" || intent === "create") {
    const id = String(form.get("id") || "");
    const updated = await db.giftSync.updateMany({
      where: {
        id,
        shop: session.shop,
        ...(intent === "create"
          ? {
              state: "queued",
              orderId: null,
              draftOrderId: null,
              creationAttempted: false,
              processingRequested: false,
              campaignId: { in: config.campaignIds },
            }
          : {}),
      },
      data: {
        state: intent === "create" ? "order_requested" : "queued",
        processingRequested: true,
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });
    if (!updated.count)
      return {
        error:
          "This gift is already processing or no longer available. Refresh the list.",
        message: null,
      };
    return {
      error: null,
      message:
        intent === "create"
          ? "Order creation queued. Its status will update automatically."
          : "Shipment reconciliation queued.",
    };
  }
  if (intent === "sync") {
    await db.shopSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, syncRequested: true },
      update: { syncRequested: true, nextPollAttemptAt: new Date() },
    });
    return {
      error: null,
      message:
        "Fetching gifts from Superfiliate. The list will update automatically.",
    };
  }
  return { error: "Unknown action", message: null };
}
export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        navigation.state === "idle" &&
        revalidator.state === "idle"
      )
        revalidator.revalidate();
    }, 5000);
    return () => clearInterval(timer);
  }, [navigation.state, revalidator]);
  return (
    <GiftingDashboard
      {...data}
      error={actionData?.error || data.error}
      message={actionData?.message}
      pending={navigation.state !== "idle"}
    />
  );
}
