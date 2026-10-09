import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import db from "../db.server";
import { assertConfiguredShop, authenticate } from "../shopify.server";
import { getIntegrationConfig } from "../gifting/config.server";
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
        campaignId: true,
        creatorName: true,
        state: true,
        orderId: true,
        orderName: true,
        lastError: true,
      },
    }),
  ]);
  let configured = true;
  try {
    getIntegrationConfig();
  } catch {
    configured = false;
  }
  return {
    shop: session.shop,
    settings,
    records,
    configured,
    campaigns: process.env.SF_CAMPAIGN_IDS || "",
    trackingEnabled: process.env.SF_TRACKING_UPDATES_ENABLED === "true",
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  assertConfiguredShop(session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "enable" || intent === "sync") {
    try {
      getIntegrationConfig();
    } catch {
      return {
        error:
          "Configure the Superfiliate credentials and campaign IDs in your deployment environment first.",
      };
    }
    const existing = await db.shopSettings.findUnique({
      where: { shop: session.shop },
    });
    if (existing?.uninstalledAt)
      return {
        error:
          "Reinstall this app and restart the worker before resuming this connection.",
      };
  }
  if (intent === "retry") {
    const id = String(form.get("id") || "");
    await db.giftSync.updateMany({
      where: { id, shop: session.shop },
      data: { state: "queued", nextAttemptAt: new Date(), lastError: null },
    });
  } else if (["enable", "pause", "sync"].includes(String(intent))) {
    await db.shopSettings.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        enabled: intent === "enable",
        syncRequested: intent === "sync",
      },
      update:
        intent === "sync"
          ? { syncRequested: true }
          : { enabled: intent === "enable" },
    });
  } else return { error: "Unknown action" };
  return { error: null };
}
export default function Dashboard() {
  const { shop, settings, records, configured, campaigns, trackingEnabled } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const pending = useNavigation().state !== "idle";
  return (
    <main className="dashboard">
      <header>
        <p className="eyebrow">SUPERFILIATE · MERCHANT-OWNED EXAMPLE</p>
        <h1>Gifts, ready for your warehouse.</h1>
        <p className="lede">
          Create Shopify orders from submitted gifts. Keep shipment details in
          sync.
        </p>
      </header>
      <section className="connection">
        <div>
          <strong>{shop}</strong>
          <p>Campaigns: {campaigns || "Not configured"}</p>
        </div>
        <span className={`badge ${settings.enabled ? "green" : "neutral"}`}>
          {settings.enabled
            ? "Automatic imports on"
            : "Automatic imports paused"}
        </span>
      </section>
      {!configured && (
        <p className="notice">
          Set your Superfiliate credentials and campaign IDs in the deployment
          environment to connect this store.
        </p>
      )}
      {!trackingEnabled && (
        <p className="notice">
          Initial shipment sync is available. Later tracking changes require the
          companion Superfiliate API endpoint and
          SF_TRACKING_UPDATES_ENABLED=true.
        </p>
      )}
      {(settings.lastError || actionData?.error) && (
        <p className="notice error" role="alert">
          {actionData?.error || settings.lastError}
        </p>
      )}
      <div className="toolbar">
        <Form method="post">
          <button name="intent" value="sync" disabled={pending || !configured}>
            Sync now
          </button>
        </Form>
        <Form method="post">
          <button
            className="secondary"
            name="intent"
            value={settings.enabled ? "pause" : "enable"}
            disabled={pending || !configured}
          >
            {settings.enabled ? "Pause imports" : "Enable automatic imports"}
          </button>
        </Form>
        <p>
          Last fetch:{" "}
          {settings.lastPolledAt
            ? new Date(settings.lastPolledAt).toISOString()
            : "Not fetched yet"}
        </p>
      </div>
      <section className="card">
        <h2>Recent gifts</h2>
        <p>Order creation and shipment sync run in the background worker.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reward</th>
                <th>Creator</th>
                <th>Shopify order</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>
                    #{record.rewardId}
                    <small>Campaign {record.campaignId}</small>
                  </td>
                  <td>{record.creatorName}</td>
                  <td>
                    {record.orderId ? (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://${shop}/admin/orders/${record.orderId.split("/").pop()}`}
                      >
                        {record.orderName || "View order"}
                      </a>
                    ) : (
                      "Pending"
                    )}
                  </td>
                  <td>
                    <span className="badge neutral">
                      {record.state.replaceAll("_", " ")}
                    </span>
                    {record.lastError && (
                      <small className="record-error">{record.lastError}</small>
                    )}
                  </td>
                  <td>
                    {record.lastError && (
                      <Form method="post">
                        <input type="hidden" name="id" value={record.id} />
                        <button
                          className="secondary"
                          name="intent"
                          value="retry"
                          disabled={pending}
                        >
                          Retry reconciliation
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.length && (
          <div className="empty">
            <h3>Your next gift starts here.</h3>
            <p>
              Submit a test gift in an enabled merchant-managed campaign, then
              choose Sync now.
            </p>
          </div>
        )}
      </section>
      <footer>
        Gifts are marked shipped after Shopify reports complete fulfilment.
        Pausing imports keeps shipment reconciliation running.
      </footer>
    </main>
  );
}
