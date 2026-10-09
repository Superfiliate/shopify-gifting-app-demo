import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptCredentials,
  encryptCredentials,
} from "../app/gifting/credentials.server";
afterEach(() => vi.unstubAllEnvs());
describe("stored API credentials", () => {
  it("encrypts credentials with a fresh nonce and binds them to the shop", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", "test-app-secret");
    const credentials = {
      clientId: "client-id",
      clientSecret: "private-client-secret",
    };
    const encrypted = encryptCredentials("shop.myshopify.com", credentials);
    expect(encrypted).not.toContain(credentials.clientSecret);
    expect(encryptCredentials("shop.myshopify.com", credentials)).not.toBe(
      encrypted,
    );
    expect(decryptCredentials("shop.myshopify.com", encrypted)).toEqual(
      credentials,
    );
    expect(() =>
      decryptCredentials("other.myshopify.com", encrypted),
    ).toThrow();
    vi.stubEnv("SHOPIFY_API_SECRET", "rotated-secret");
    expect(() => decryptCredentials("shop.myshopify.com", encrypted)).toThrow();
  });
});
