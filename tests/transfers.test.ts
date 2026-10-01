import { readFileSync, writeFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { auth, testApp } from "./helpers.js";

/** Like testApp, but with a second account `acc_2` so money has somewhere to go. */
function twoAccountApp(txCount: number) {
  const { dataPath } = testApp(txCount);
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  data.accounts.push({ id: "acc_2", owner: "Rick", currency: "USD", openedAt: "2025-01-01T00:00:00Z" });
  writeFileSync(dataPath, JSON.stringify(data));
  return createApp({ dataPath, keysPath: dataPath.replace(/ledger\.json$/, "keys.json") });
}

describe("transfers", () => {
  it("moves money between accounts as a debit and a credit", async () => {
    const app = twoAccountApp(3); // acc_1 balance 600
    const res = await request(app).post("/accounts/acc_1/transfers").set(auth).send({ toAccountId: "acc_2", amountCents: 250, memo: "rent" });
    expect(res.status).toBe(201);
    expect(res.body.debit).toMatchObject({ accountId: "acc_1", amountCents: -250 });
    expect(res.body.credit).toMatchObject({ accountId: "acc_2", amountCents: 250 });
    expect((await request(app).get("/accounts/acc_1").set(auth)).body.balanceCents).toBe(350);
    expect((await request(app).get("/accounts/acc_2").set(auth)).body.balanceCents).toBe(250);
  });

  it("404s unknown source or destination accounts", async () => {
    const app = twoAccountApp(1);
    expect((await request(app).post("/accounts/nope/transfers").set(auth).send({ toAccountId: "acc_2", amountCents: 1, memo: "x" })).status).toBe(404);
    expect((await request(app).post("/accounts/acc_1/transfers").set(auth).send({ toAccountId: "nope", amountCents: 1, memo: "x" })).status).toBe(404);
  });

  it("rejects non-positive amounts and missing fields", async () => {
    const app = twoAccountApp(1);
    expect((await request(app).post("/accounts/acc_1/transfers").set(auth).send({ toAccountId: "acc_2", amountCents: 0, memo: "x" })).status).toBe(400);
    expect((await request(app).post("/accounts/acc_1/transfers").set(auth).send({ toAccountId: "acc_2", amountCents: -5, memo: "x" })).status).toBe(400);
    expect((await request(app).post("/accounts/acc_1/transfers").set(auth).send({ toAccountId: "acc_2", amountCents: 5 })).status).toBe(400);
  });
});
