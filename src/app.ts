import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { apiKeyAuth } from "./auth.js";
import { rateLimit } from "./rate-limit.js";
import { Store } from "./store.js";

export type AppOptions = { dataPath: string; keysPath: string; now?: () => number };

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const newTransaction = z.object({
  amountCents: z.number().int().refine((n) => n !== 0, "amountCents must not be zero"),
  memo: z.string().min(1).max(140),
});

const newTransfer = z.object({
  toAccountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  memo: z.string().min(1).max(140),
});

export function createApp(opts: AppOptions): Express {
  const store = new Store(opts.dataPath);
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  // The web UI is public; it sends the API key itself on every call.
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.use(apiKeyAuth(opts.keysPath));
  app.use(rateLimit({ now: opts.now }));

  app.get("/accounts", (_req, res) => {
    res.json(store.accounts().map((a) => ({ ...a, balanceCents: store.balanceCents(a.id) })));
  });

  app.get("/accounts/:id", (req, res) => {
    const account = store.account(String(req.params.id));
    if (!account) {
      res.status(404).json({ error: "NOT_FOUND", message: "no such account" });
      return;
    }
    res.json({ ...account, balanceCents: store.balanceCents(account.id) });
  });

  app.get("/accounts/:id/transactions", (req, res) => {
    const account = store.account(String(req.params.id));
    if (!account) {
      res.status(404).json({ error: "NOT_FOUND", message: "no such account" });
      return;
    }
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const { page, pageSize } = parsed.data;
    const all = store.transactionsOf(account.id);
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    res.json({ page, pageSize, total: all.length, totalPages: Math.ceil(all.length / pageSize), items });
  });

  app.post("/accounts/:id/transactions", (req, res) => {
    const account = store.account(String(req.params.id));
    if (!account) {
      res.status(404).json({ error: "NOT_FOUND", message: "no such account" });
      return;
    }
    const parsed = newTransaction.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const tx = store.addTransaction({ accountId: account.id, ...parsed.data });
    res.status(201).json(tx);
  });

  app.post("/accounts/:id/transfers", (req, res) => {
    const from = store.account(String(req.params.id));
    if (!from) {
      res.status(404).json({ error: "NOT_FOUND", message: "no such account" });
      return;
    }
    const parsed = newTransfer.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const { toAccountId, amountCents, memo } = parsed.data;
    const to = store.account(toAccountId);
    if (!to) {
      res.status(404).json({ error: "NOT_FOUND", message: "no such destination account" });
      return;
    }
    const debit = store.addTransaction({ accountId: from.id, amountCents: -amountCents, memo: `transfer to ${to.id}: ${memo}` });
    const credit = store.addTransaction({ accountId: to.id, amountCents, memo: `transfer from ${from.id}: ${memo}` });
    res.status(201).json({ debit, credit });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if ("type" in err && (err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: "VALIDATION", message: "body must be valid JSON" });
      return;
    }
    res.status(500).json({ error: "INTERNAL", message: "unexpected error" });
  });
  return app;
}
