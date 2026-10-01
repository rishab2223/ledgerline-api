import request from "supertest";
import { describe, expect, it } from "vitest";
import { auth, testApp } from "./helpers.js";

/** A manual clock so refill can be driven without sleeping (ADR-007). */
function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("rate limiting (ADR-007)", () => {
  it("allows the free tier 20 requests, then rejects with 429 and Retry-After", async () => {
    const c = clock();
    const { app } = testApp(0, { now: c.now });
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/accounts").set(auth);
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe("20");
      expect(res.headers["x-ratelimit-remaining"]).toBe(String(19 - i));
    }
    const rejected = await request(app).get("/accounts").set(auth);
    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({ error: "RATE_LIMITED" });
    expect(rejected.headers["x-ratelimit-remaining"]).toBe("0");
    expect(Number(rejected.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("refills continuously: one token every 3 s on the free tier", async () => {
    const c = clock();
    const { app } = testApp(0, { now: c.now });
    for (let i = 0; i < 20; i++) await request(app).get("/accounts").set(auth);
    expect((await request(app).get("/accounts").set(auth)).status).toBe(429);
    c.advance(3_000);
    expect((await request(app).get("/accounts").set(auth)).status).toBe(200);
    c.advance(60_000);
    const full = await request(app).get("/accounts").set(auth);
    expect(full.headers["x-ratelimit-remaining"]).toBe("19");
    expect(full.headers["x-ratelimit-reset"]).toBe("3");
  });

  it("gives the pro tier a capacity of 200 and keys separate buckets", async () => {
    const c = clock();
    const { app } = testApp(0, { now: c.now });
    for (let i = 0; i < 20; i++) await request(app).get("/accounts").set(auth);
    expect((await request(app).get("/accounts").set(auth)).status).toBe(429);
    const pro = await request(app).get("/accounts").set({ "x-api-key": "kpro" });
    expect(pro.status).toBe(200);
    expect(pro.headers["x-ratelimit-limit"]).toBe("200");
    expect(pro.headers["x-ratelimit-remaining"]).toBe("199");
  });

  it("never limits /health", async () => {
    const c = clock();
    const { app } = testApp(0, { now: c.now });
    for (let i = 0; i < 25; i++) await request(app).get("/accounts").set(auth);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });
});
