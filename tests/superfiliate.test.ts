import { afterEach, describe, expect, it, vi } from "vitest";
import { createSuperfiliate } from "../app/gifting/superfiliate.server";
import { fixtureReward } from "../app/gifting/fixtures";
afterEach(() => vi.unstubAllEnvs());
describe("Superfiliate API contract", () => {
  it("fetches every page using client ID and secret bearer authentication", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          Array.from({ length: 250 }, (_, i) => ({
            ...fixtureReward,
            id: i + 1,
          })),
        ),
      )
      .mockResolvedValueOnce(Response.json([{ ...fixtureReward, id: 251 }]));
    const rewards = await createSuperfiliate(fetcher).listReady();
    expect(rewards).toHaveLength(251);
    expect(fetcher.mock.calls[1][0]).toContain("page=2");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer sfci1_fixture:sfcs1_fixture",
    });
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
  });
  it("rejects rewards from a different campaign", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json([
          { ...fixtureReward, campaign: { id: 999, name: "Wrong campaign" } },
        ]),
      );
    await expect(createSuperfiliate(fetcher).listReady()).rejects.toThrow(
      "outside the requested campaign",
    );
  });
  it("keeps the missing tracking endpoint visible without calling it", async () => {
    vi.stubEnv("SF_TRACKING_UPDATES_ENABLED", "false");
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createSuperfiliate(fetcher).updateTracking(1, {
        external_order_id: "order-1",
        carrier: null,
        tracking_number: "TRACK",
        tracking_url: null,
      }),
    ).rejects.toThrow("companion");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the partial-update contract once enabled", async () => {
    vi.stubEnv("SF_TRACKING_UPDATES_ENABLED", "true");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await createSuperfiliate(fetcher).updateTracking(1, {
      external_order_id: "order-1",
      carrier: null,
      tracking_number: "TRACK",
      tracking_url: null,
    });
    expect(fetcher.mock.calls[0][0]).toMatch(
      /gifting_rewards\/1\/fulfillment$/,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("PATCH");
  });
});
