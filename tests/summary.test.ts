import request from "supertest";
import { describe, expect, it } from "vitest";
import { auth, testApp } from "./helpers.js";

describe("account summary", () => {
  it("returns balance, count and last posting time", async () => {
    const { app } = testApp(3);
    const res = await request(app).get("/accounts/acc_1/summary").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "acc_1", currency: "USD", balanceCents: 600, transactionCount: 3 });
    expect(res.body.lastPostedAt).toBe(new Date(Date.UTC(2026, 0, 3)).toISOString());
  });

  it("handles an empty account and unknown ids", async () => {
    const { app } = testApp(0);
    const res = await request(app).get("/accounts/acc_1/summary").set(auth);
    expect(res.body).toMatchObject({ balanceCents: 0, transactionCount: 0, lastPostedAt: null });
    expect((await request(app).get("/accounts/nope/summary").set(auth)).status).toBe(404);
    expect((await request(app).get("/accounts/acc_1/summary")).status).toBe(401);
  });
});
