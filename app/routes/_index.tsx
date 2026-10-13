import {
  Link,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
export function loader({ request }: LoaderFunctionArgs) {
  const demo = process.env.DEMO_MODE === "true";
  const url = new URL(request.url);
  if (!demo && url.searchParams.has("shop"))
    return redirect(`/app${url.search}`);
  return { demo };
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
