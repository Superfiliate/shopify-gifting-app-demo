import { afterEach, describe, expect, it, vi } from "vitest";
import { loader } from "../app/routes/_index";
afterEach(() => vi.unstubAllEnvs());
function load(url: string) {
  return loader({
    request: new Request(url),
    params: {},
    context: {},
    url: new URL(url),
    pattern: "/",
  });
}
describe("Shopify app entry", () => {
  it("opens the authenticated dashboard and preserves Shopify launch parameters", () => {
    vi.stubEnv("DEMO_MODE", "false");
    const response = load(
      "https://example.com/?shop=fixture.myshopify.com&host=fixture-host&embedded=1&id_token=fixture-token",
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe(
      "/app?shop=fixture.myshopify.com&host=fixture-host&embedded=1&id_token=fixture-token",
    );
  });
  it("keeps the demo and direct visits on the landing page", () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(load("https://example.com/?shop=fixture.myshopify.com")).toEqual({
      demo: true,
    });
    vi.stubEnv("DEMO_MODE", "false");
    expect(load("https://example.com/")).toEqual({ demo: false });
  });
});
