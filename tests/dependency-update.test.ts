import { createRequire } from "node:module";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { auth, testApp } from "./helpers.js";

const require = createRequire(import.meta.url);

describe("dependency security updates", () => {
  it("pins zod to the CVE-fixed 4.6.6", () => {
    expect(require("zod/package.json").version).toBe("4.6.6");
  });

  it("pins body-parser to the CVE-fixed 2.4.0", () => {
    expect(require("body-parser/package.json").version).toBe("2.4.0");
  });

  it("keeps JSON body parsing and zod validation working after the upgrades", async () => {
    const { app } = testApp(3);
    const ok = await request(app).post("/accounts/acc_1/transactions").set(auth).send({ amountCents: 100, memo: "deposit" });
    expect(ok.status).toBe(201);
    const badJson = await request(app).post("/accounts/acc_1/transactions").set(auth).set("Content-Type", "application/json").send("{not-json");
    expect(badJson.status).toBe(400);
    const badBody = await request(app).post("/accounts/acc_1/transactions").set(auth).send({ amountCents: "not-a-number", memo: "x" });
    expect(badBody.status).toBe(400);
    const badPage = await request(app).get("/accounts/acc_1/transactions?page=0").set(auth);
    expect(badPage.status).toBe(400);
  });
});
