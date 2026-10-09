import { Link, useLoaderData } from "react-router";
export function loader() {
  return { demo: process.env.DEMO_MODE === "true" };
}
export default function Index() {
  const { demo } = useLoaderData<typeof loader>();
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "80px auto",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <h1>Superfiliate gifting example</h1>
      <p>A reference integration for a merchant-owned Shopify custom app.</p>
      <p>
        Open the installed app through Shopify admin to manage live gifting.
      </p>
      {demo ? <Link to="/demo">Explore the fixture demo</Link> : null}
    </main>
  );
}
