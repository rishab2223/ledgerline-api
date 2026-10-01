import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";

/** A fresh app over a temp ledger seeded with one account and `txCount` transactions (newest = highest id). */
export function testApp(txCount = 0, opts: { now?: () => number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ledgerline-"));
  const dataPath = join(dir, "ledger.json");
  const transactions = Array.from({ length: txCount }, (_, i) => ({
    id: `tx_${String(i + 1).padStart(6, "0")}`,
    accountId: "acc_1",
    amountCents: (i + 1) * 100,
    memo: `seed ${i + 1}`,
    postedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));
  writeFileSync(dataPath, JSON.stringify({ accounts: [{ id: "acc_1", owner: "Ilsa", currency: "USD", openedAt: "2025-01-01T00:00:00Z" }], transactions, nextTx: txCount + 1 }));
  const keysPath = join(dir, "keys.json");
  writeFileSync(keysPath, JSON.stringify([{ key: "k1", label: "t", tier: "free" }, { key: "kpro", label: "p", tier: "pro" }]));
  return { app: createApp({ dataPath, keysPath, now: opts.now }), dataPath };
}

export const auth = { "x-api-key": "k1" };
