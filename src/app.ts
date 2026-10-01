import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { apiKeyAuth } from "./auth.js";
import { Store } from "./store.js";

export type AppOptions = { dataPath: string; keysPath: string };

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const newTransaction = z.object({
  amountCents: z.number().int().refine((n) => n !== 0, "amountCents must not be zero"),
  memo: z.string().min(1).max(140),
});

export function createApp(opts: AppOptions): Express {
  const store = new Store(opts.dataPath);
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(apiKeyAuth(opts.keysPath));

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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if ("type" in err && (err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: "VALIDATION", message: "body must be valid JSON" });
      return;
    }
    res.status(500).json({ error: "INTERNAL", message: "unexpected error" });
  });
  return app;
}
