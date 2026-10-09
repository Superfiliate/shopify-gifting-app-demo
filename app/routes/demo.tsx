import { useState } from "react";
import {
  GiftingDashboard,
  type GiftRow,
} from "../components/gifting-dashboard";
import { fixtureReward } from "../gifting/fixtures";
import "../styles/dashboard.css";

export function loader() {
  if (process.env.DEMO_MODE !== "true")
    throw new Response("Not found", { status: 404 });
  return null;
}
export default function Demo() {
  const [records, setRecords] = useState<GiftRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState(String(fixtureReward.campaign.id));
  const [enabled, setEnabled] = useState(false);
  const [automaticOrders, setAutomaticOrders] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  function act(form: FormData) {
    const intent = form.get("intent");
    if (intent === "settings") {
      setCampaigns(String(form.get("campaignIds") || ""));
      setEnabled(form.get("enabled") === "on");
      setAutomaticOrders(form.get("automaticOrders") === "on");
      setMessage("Sample settings saved. No connection was made.");
    } else if (intent === "sync") {
      setRecords((previous) =>
        previous.length
          ? previous
          : [
              {
                id: "fixture",
                rewardId: fixtureReward.id,
                creatorName: "Alex Creator",
                orderId: automaticOrders ? "gid://shopify/Order/1001" : null,
                orderName: automaticOrders ? "#DEMO-1001" : null,
                state: automaticOrders ? "awaiting_fulfillment" : "queued",
                fulfilled: false,
                trackingNumber: null,
                lastError: null,
              },
            ],
      );
      setLastFetched(new Date().toISOString());
      setMessage("Sample gift loaded. Repeated fetches keep the same gift.");
    } else {
      setRecords((previous) =>
        previous.map((record) => {
          if (record.id !== form.get("id")) return record;
          if (intent === "create")
            return {
              ...record,
              orderId: "gid://shopify/Order/1001",
              orderName: "#DEMO-1001",
              state: "awaiting_fulfillment",
            };
          if (intent === "ship")
            return { ...record, fulfilled: true, state: "synced" };
          if (intent === "track")
            return { ...record, trackingNumber: "DEMO-TRACK-001" };
          return record;
        }),
      );
      setMessage(
        intent === "create"
          ? "Sample $0 order created. In the installed app, this creates a real Shopify draft and completes it."
          : intent === "ship"
            ? "Simulated Shopify fulfillment: Superfiliate now shows shipped."
            : "Sample tracking synced to Superfiliate.",
      );
    }
  }
  return (
    <GiftingDashboard
      shop="your-test-store.myshopify.com"
      configured
      campaigns={campaigns}
      credentialsSaved
      enabled={enabled}
      automaticOrders={automaticOrders}
      syncRequested={false}
      lastFetched={lastFetched}
      trackingEnabled
      records={records}
      message={message}
      demo
      onDemoAction={act}
    />
  );
}
