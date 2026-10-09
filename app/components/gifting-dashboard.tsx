import type { FormEvent } from "react";
import { Form } from "react-router";

export interface GiftRow {
  id: string;
  rewardId: number;
  creatorName: string;
  orderId: string | null;
  orderName: string | null;
  state: string;
  fulfilled: boolean;
  trackingNumber: string | null;
  lastError: string | null;
}
interface Props {
  shop: string;
  configured: boolean;
  campaigns: string;
  credentialsSaved: boolean;
  enabled: boolean;
  automaticOrders: boolean;
  syncRequested: boolean;
  lastFetched: string | null;
  trackingEnabled: boolean;
  records: GiftRow[];
  pending?: boolean;
  message?: string | null;
  error?: string | null;
  demo?: boolean;
  onDemoAction?: (form: FormData) => void;
}
function status(record: GiftRow) {
  if (record.lastError) return "Needs attention";
  if (record.fulfilled)
    return record.trackingNumber
      ? "Shipped · tracking synced"
      : "Shipped · tracking pending";
  if (record.orderId) return "Awaiting shipment";
  if (record.state === "queued") return "Ready to create order";
  return "Creating order";
}
export function GiftingDashboard(props: Props) {
  const submit = props.demo
    ? (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        props.onDemoAction?.(new FormData(event.currentTarget, submitter));
      }
    : undefined;
  return (
    <main className="dashboard">
      <header className="page-heading">
        <div>
          <h1>Gifting orders</h1>
          <p>Fetch gifts, create Shopify orders, and follow their shipment.</p>
        </div>
        <span className={`badge ${props.demo ? "neutral" : "green"}`}>
          {props.demo ? "Sample data" : "Shopify installed"}
        </span>
      </header>
      {props.demo && (
        <p className="notice">
          Preview only — sample data, no API calls. The installed app uses this
          same screen with your real store.
        </p>
      )}
      <details className="card settings" open={!props.configured}>
        <summary>
          Quick settings{" "}
          <span>{props.configured ? "Configured" : "Setup needed"}</span>
        </summary>
        <Form method="post" onSubmit={submit} className="settings-form">
          <input type="hidden" name="intent" value="settings" />
          <label>
            Shopify store
            <input value={props.shop} readOnly />
            <small>Connected when you install this custom app.</small>
          </label>
          <label>
            Campaign IDs
            <input
              name="campaignIds"
              defaultValue={props.campaigns}
              required
              placeholder="123456"
            />
            <small>Comma-separated IDs of merchant-managed campaigns.</small>
          </label>
          <label>
            Superfiliate client ID
            <input
              name="clientId"
              autoComplete="off"
              placeholder={
                props.credentialsSaved
                  ? "Saved · leave blank to keep"
                  : "sfci1_…"
              }
            />
          </label>
          <label>
            Superfiliate client secret
            <input
              name="clientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={
                props.credentialsSaved
                  ? "Saved · leave blank to keep"
                  : "sfcs1_…"
              }
            />
            <small>Credentials stay encrypted on the server.</small>
          </label>
          <label className="checkbox">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={props.enabled}
            />
            Fetch new gifts automatically
          </label>
          <label className="checkbox">
            <input
              name="automaticOrders"
              type="checkbox"
              defaultChecked={props.automaticOrders}
            />
            Create orders automatically after fetching
          </label>
          <div className="settings-submit">
            <button disabled={props.pending}>Save & test connection</button>
            <small>Tests Superfiliate access without creating orders.</small>
          </div>
        </Form>
      </details>
      {props.error && (
        <p className="notice error" role="alert">
          {props.error}
        </p>
      )}
      {props.message && (
        <p className="notice success" role="status">
          {props.message}
        </p>
      )}
      <section className="card orders">
        <div className="section-heading">
          <div>
            <h2>Orders</h2>
            <p>
              {props.shop} · Campaigns {props.campaigns || "not configured"}
            </p>
          </div>
          <Form method="post" onSubmit={submit}>
            <button
              name="intent"
              value="sync"
              disabled={
                props.pending || !props.configured || props.syncRequested
              }
            >
              {props.syncRequested ? "Fetching…" : "Fetch gifts"}
            </button>
          </Form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gift / creator</th>
                <th>Shopify order</th>
                <th>Status</th>
                <th>Tracking</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {props.records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.creatorName || "Gift recipient"}</strong>
                    <small>Gift #{record.rewardId}</small>
                  </td>
                  <td>
                    {record.orderId ? (
                      <a
                        href={`https://${props.shop}/admin/orders/${record.orderId.split("/").pop()}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {record.orderName || "View order"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${record.lastError ? "red" : record.fulfilled ? "green" : "neutral"}`}
                    >
                      {status(record)}
                    </span>
                    {record.lastError && (
                      <small className="record-error">{record.lastError}</small>
                    )}
                  </td>
                  <td>{record.trackingNumber || "—"}</td>
                  <td>
                    {(!record.orderId || record.lastError) && (
                      <Form method="post" onSubmit={submit}>
                        <input type="hidden" name="id" value={record.id} />
                        <button
                          className={record.lastError ? "secondary" : undefined}
                          name="intent"
                          value={record.lastError ? "retry" : "create"}
                          disabled={
                            props.pending ||
                            !props.configured ||
                            (!record.lastError && record.state !== "queued")
                          }
                        >
                          {record.lastError
                            ? "Retry sync"
                            : record.state === "queued"
                              ? "Create order"
                              : "Creating…"}
                        </button>
                      </Form>
                    )}
                    {props.demo &&
                      record.orderId &&
                      (!record.fulfilled || !record.trackingNumber) && (
                        <Form method="post" onSubmit={submit}>
                          <input type="hidden" name="id" value={record.id} />
                          <button
                            className="secondary"
                            name="intent"
                            value={record.fulfilled ? "track" : "ship"}
                          >
                            {record.fulfilled
                              ? "Simulate tracking"
                              : "Simulate shipment"}
                          </button>
                        </Form>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!props.records.length && (
          <div className="empty">
            <h3>No gifts yet</h3>
            <p>
              Fetch gifts to load submitted addresses and selected products from
              Superfiliate.
            </p>
          </div>
        )}
        <p className="table-note">
          Last fetch:{" "}
          {props.lastFetched
            ? new Date(props.lastFetched).toLocaleString("en-US", {
                timeZone: "UTC",
              }) + " UTC"
            : "Not fetched yet"}{" "}
          · Automatic orders {props.automaticOrders ? "on" : "off"}
        </p>
      </section>
      <footer>
        <strong>How it works:</strong> Fetch gifts → Create a $0 Shopify order →
        Fulfill in Shopify → Superfiliate shows shipped.
        {!props.trackingEnabled &&
          " Late tracking sync is waiting for the Superfiliate API update."}
      </footer>
    </main>
  );
}
