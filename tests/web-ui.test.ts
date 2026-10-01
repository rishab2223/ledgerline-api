import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

describe("web ui", () => {
  it("serves the page at / without an api key", async () => {
    const { app } = testApp();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Ledgerline");
  });

  it("keeps the API behind the key", async () => {
    const { app } = testApp();
    expect((await request(app).get("/accounts")).status).toBe(401);
    expect((await request(app).get("/health")).status).toBe(200);
  });
});
