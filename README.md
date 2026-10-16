# 🎰 BINGO BET — Live 75-Ball Multiplayer Bingo (Telegram Mini App)

Real-time multiplayer 75-ball Bingo for the Ethiopian market, played inside Telegram. Built with **React + Vite + Tailwind** (frontend) and **Node.js / Express + Socket.io + SQLite (`node:sqlite`)** (backend).

- Four live rooms: Starter Lounge (10 Birr), Bronze Room (20), Gold Arena (50), Diamond High-Roller (100). 200 numbered cards per room, 20% rake (0% when exactly 5 players).
- Telebirr deposits and withdrawals, verified manually by agents / super admins.
- Telegram WebApp HMAC login, phone verification via the bot, phone + password login.
- SHA-256 committed ball sequence (provably fair), Daily Grand Jackpot, referrals, leaderboards.
- Agent and Super Admin dashboards.

---

## 🚀 Local development

**Requires Node.js 22.13+** (the database uses the built-in `node:sqlite` module). `nvm use` picks the right version from `.nvmrc`.

```bash
npm install
cp .env.example .env   # then fill in what you need
npm run dev            # backend on :3001, frontend on :5173
```

```bash
npm test               # full vitest suite (in-memory database)
npx tsc --noEmit       # typecheck frontend + server
```

The local database is `data/bingo.db` (git-ignored). A placeholder Telebirr deposit number is seeded in development only.

---

## 🌐 Production deployment

The current setup is **backend on Render** (`render.yaml`) and **frontend on Vercel** (`vercel.json`). The frontend talks to the Render backend directly (REST + WebSockets). Express can also serve the built SPA itself, so a single Render service is enough if you prefer.

### Launch checklist

1. **Persistent database (required before real money).** Render's free plan wipes the disk on every deploy and restart, so all users, balances and ledger history are lost. Move the service to a paid plan, uncomment the `disk` block and `DATABASE_PATH` in `render.yaml`, and redeploy. `GET /api/health` shows `database.persistentPathConfigured: true` once it's set up.
2. **Environment variables** on Render (see the table below). `JACKPOT_SERVER_SECRET` is mandatory: the server refuses to start in production without it (the blueprint generates one).
3. **Configure the real Telebirr deposit account** in Super Admin → Payment Accounts. Until you do, customers see "Deposits are temporarily unavailable", and `/api/health` shows `payments.depositAccountConfigured: false`.
4. **Super admins.** Put the admins' numeric Telegram IDs in `SUPER_ADMIN_TELEGRAM_IDS`. Admins can then promote agents from the dashboard.
5. **Bot webhook.** Set `TELEGRAM_WEBHOOK_SECRET`. On boot the server registers `https://<RENDER_EXTERNAL_URL>/api/telegram/webhook` with Telegram, which also wakes a sleeping instance. Without it, the bot falls back to polling and stops answering while the instance sleeps. `/api/health` shows `telegram.mode`.
6. **Bot menu & Mini App URL.** Set `FRONTEND_URL` to the deployed frontend URL. Optionally run `node scripts/setup-bot.js` once to set the bot's commands and descriptions.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | ✅ | `production` on the server |
| `JACKPOT_SERVER_SECRET` | ✅ (prod) | Daily Jackpot fairness seed; the server won't start without it |
| `DATABASE_PATH` | ✅ for real money | SQLite file on a persistent disk, e.g. `/var/data/bingo.db` |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather; also verifies Mini App logins |
| `TELEGRAM_BOT_USERNAME` | ✅ | Bot username without `@` |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | Random `A-Za-z0-9_-` string (e.g. `openssl rand -hex 32`); enables webhook mode |
| `TELEGRAM_WEBHOOK_URL` | optional | Public backend URL for the webhook; defaults to Render's `RENDER_EXTERNAL_URL` |
| `FRONTEND_URL` | ✅ | Deployed Mini App URL (bot menu button + CORS) |
| `SUPER_ADMIN_TELEGRAM_IDS` | ✅ | Comma-separated numeric Telegram IDs granted Super Admin |
| `ALLOWED_ORIGINS` | optional | Extra comma-separated CORS origins |
| `TRUST_PROXY` | optional | Proxy hops to trust for client IPs (default `1` in production) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | optional | Auth requests per minute per IP (default 15); raise it if many testers share one network |
| `MIN_CARDS_TO_START` | optional | Cards needed before a room's countdown starts |
| `VITE_BACKEND_URL` | frontend build | Backend URL baked into the frontend build (defaults to the Render URL) |

### Health checks

- `GET /api/health`: database, rooms, sockets, memory, plus launch flags (`database.persistentPathConfigured`, `payments.depositAccountConfigured`, `telegram.mode`)
- `GET /api/health/readiness`: used by Render's health check
- `GET /api/health/liveness`

---

## 🧪 Initial real-time testing tips

- Render's free instances sleep after ~15 minutes idle; the first request then takes ~50s. Open the app a minute before a test session.
- Testers on the same Wi-Fi share one IP for rate limiting. Raise `AUTH_RATE_LIMIT_PER_MINUTE` for group sessions.
- On the free plan, a redeploy wipes all test accounts and balances.
