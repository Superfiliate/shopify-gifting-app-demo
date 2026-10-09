import { useState } from "react";
import { fixtureReward } from "../gifting/fixtures";
import { draftInput } from "../gifting/draft";
import "../styles/dashboard.css";

export function loader() {
  if (process.env.DEMO_MODE !== "true")
    throw new Response("Not found", { status: 404 });
  return null;
}
const steps = [
  {
    title: "Creator details received",
    detail:
      "Superfiliate returns a ready_to_send reward with selected products and a shipping address.",
    state: "Ready to send",
  },
  {
    title: "Shopify order created",
    detail:
      "The worker creates a discounted draft, checks the zero total and completes it. The warehouse can now process the order.",
    state: "Awaiting fulfilment",
  },
  {
    title: "Gift fulfilled",
    detail:
      "Shopify reports successful fulfilment. The worker calls Superfiliate /fulfill with the order reference.",
    state: "Shipped · tracking pending",
  },
  {
    title: "Tracking added",
    detail:
      "Shopify adds tracking later. The worker updates the shipment through the companion Partner API endpoint.",
    state: "Shipped · tracking synced",
  },
];
export default function Demo() {
  const [step, setStep] = useState(0);
  return (
    <main className="dashboard">
      <header>
        <p className="eyebrow">SUPERFILIATE · CUSTOM APP REFERENCE</p>
        <h1>A gift’s journey, connected.</h1>
        <p className="lede">
          See how your own Shopify app can turn submitted gifts into
          warehouse-ready orders.
        </p>
      </header>
      <p className="notice">
        Fixture demo. All data is fictional; these controls make no API calls or
        real orders.
      </p>
      <div className="demo-grid">
        <section className="card">
          <h2>Follow the gift</h2>
          <ol className="timeline">
            {steps.map((item, index) => (
              <li key={item.title} className={index <= step ? "active" : ""}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="toolbar">
            <button
              onClick={() => setStep(Math.min(step + 1, 3))}
              disabled={step === 3}
            >
              Next step
            </button>
            <button className="secondary" onClick={() => setStep(0)}>
              Reset
            </button>
          </div>
        </section>
        <section className="card">
          <p className="eyebrow">REWARD #{fixtureReward.id}</p>
          <h2>Alex Creator</h2>
          <p>Summer creator gifting</p>
          <span className="badge green">{steps[step].state}</span>
          <dl>
            <dt>Selected product</dt>
            <dd>Creator coffee bundle · Dark roast × 1</dd>
            <dt>Shopify order</dt>
            <dd>{step > 0 ? "#DEMO-1001" : "Not created yet"}</dd>
            <dt>Tracking</dt>
            <dd>
              {step === 3 ? "UPS · DEMO-TRACKING-001" : "Not available yet"}
            </dd>
          </dl>
          <p className="muted">
            The reward ID connects both systems and prevents repeated imports.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>The draft-order payload</h2>
        <p>
          The app uses the selected Shopify variant and creator address, with a
          100% gift discount and free shipping.
        </p>
        <details>
          <summary>Inspect the example request</summary>
          <pre>{JSON.stringify(draftInput(fixtureReward), null, 2)}</pre>
        </details>
      </section>
      <footer>
        Customers fork this code, register their own custom-distribution app and
        deploy it for their store.
      </footer>
    </main>
  );
}
