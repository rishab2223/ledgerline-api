# Ledgerline

A small ledger service: accounts, transactions and transfers over a JSON file
store. Node 22, Express, zod, vitest.

```bash
npm ci
npm test          # vitest
npm run lint      # eslint, zero warnings allowed
npm run typecheck # tsc --noEmit
npm run dev       # http://localhost:3000
```

Every request needs an API key in `X-Api-Key` (see `data/keys.json`; the
seeded key is `key_demo_1`). Responses are JSON. Errors follow
`{ "error": "<CODE>", "message": "..." }`.

A minimal web UI is served at `/` (static `public/index.html`): enter an API
key, see balances, post a transaction. The key stays in the page's memory.

| method | path | notes |
| --- | --- | --- |
| GET | `/accounts` | all accounts |
| GET | `/accounts/:id` | one account with its balance |
| GET | `/accounts/:id/transactions?page=&pageSize=` | newest first, paginated |
| POST | `/accounts/:id/transactions` | `{ amountCents, memo }` (positive credits, negative debits) |
| POST | `/accounts/:id/transfers` | `{ toAccountId, amountCents, memo }` (positive); debits `:id`, credits `toAccountId` |
| GET | `/accounts/:id/summary` | balance, transaction count, last posting time |
| GET | `/health` | liveness |

Authenticated routes are rate limited per API key (ADR-007): a token bucket of
20 per minute for `free` keys and 200 per minute for `pro` keys, reported in
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. An empty
bucket yields `429` with `Retry-After`. `/health` is never limited.

Design notes live in `docs/` (architecture decision records are numbered
`adr-NNN`). Contributions: keep `npm test`, `npm run lint` and
`npm run typecheck` green.
