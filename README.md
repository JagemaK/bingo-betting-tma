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

Render auto-deploys every commit to `main` through its GitHub App, so merging a PR is a production deploy.

### Launch checklist

1. **Persistent database (required before real money).** Render's free plan wipes the disk on every deploy and restart. Pick one:
   - **Redis backup (works on the free plan):** set `REDIS_URL`. See [Redis backup](#-redis-backup) below.
   - **Persistent disk:** move to a paid plan, uncomment the `disk` block and `DATABASE_PATH` in `render.yaml`, and redeploy.

   `GET /api/health` shows `database.redisBackup.enabled` or `database.persistentPathConfigured`.
2. **Environment variables** on Render (see the table below). `JACKPOT_SERVER_SECRET` is mandatory: the server refuses to start in production without it (the blueprint generates one).
3. **Configure the real Telebirr deposit account** in Super Admin → Payment Accounts, and **assign it to the agent who holds that phone**. Until you configure one, customers see "Deposits are temporarily unavailable", and `/api/health` shows `payments.depositAccountConfigured: false`. Deposits are routed to the agent who holds the receiving account; agents can only approve or reject deposits assigned to them, and only Super Admins can reassign them. Deposits to an account with no agent go to the Super Admins.
4. **Super admins.** Put the admins' numeric Telegram IDs in `SUPER_ADMIN_TELEGRAM_IDS`. Admins can then promote agents from the dashboard.
5. **Bot webhook.** Set `TELEGRAM_WEBHOOK_SECRET`. On boot the server registers `https://<RENDER_EXTERNAL_URL>/api/telegram/webhook` with Telegram, which also wakes a sleeping instance. Without it, the bot falls back to polling and stops answering while the instance sleeps. `/api/health` shows `telegram.mode`.
6. **Bot menu & Mini App URL.** Set `FRONTEND_URL` to the deployed frontend URL. Optionally run `node scripts/setup-bot.js` once to set the bot's commands and descriptions.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | ✅ | `production` on the server |
| `JACKPOT_SERVER_SECRET` | ✅ (prod) | Daily Jackpot fairness seed; the server won't start without it |
| `DATABASE_PATH` | one of these two for real money | SQLite file on a persistent disk, e.g. `/var/data/bingo.db` |
| `REDIS_URL` | one of these two for real money | Redis that stores database backups (restored on boot) |
| `REDIS_BACKUP_INTERVAL_SECONDS` | optional | How often to back up when data changed (default 10) |
| `REDIS_KEY_PREFIX` | optional | Key prefix (default `bingo:`), to share one Redis between environments |
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
| `REFERRAL_MIN_DEPOSIT_ETB` | optional | Total approved deposits a referred player needs before the referrer earns a reward (default 100) |
| `REFERRAL_MIN_CARDS` | optional | Game cards a referred player must buy before qualifying (default 5) |
| `REFERRAL_MAX_REWARDS_PER_DAY` | optional | Max referral rewards per referrer per rolling 24 hours (default 20) |
| `VITE_BACKEND_URL` | frontend build | Backend URL baked into the frontend build (defaults to the Render URL) |

### 🧰 Redis backup

With `REDIS_URL` set, `npm start` (`server/start.ts`):

1. Takes a new **generation** number (`INCR bingo:db:generation`) and, if there's no local database file, restores the latest snapshot from `bingo:db:snapshot` before the server opens the database.
2. Saves a compressed, checksummed snapshot of the whole database whenever it changed (every `REDIS_BACKUP_INTERVAL_SECONDS`), and once more on shutdown after traffic stops. The previous snapshot is kept in `bingo:db:snapshot:prev` as a fallback.

Safety rules:
- **Fencing:** only the newest instance writes snapshots, so an old instance shutting down during a deploy can't overwrite newer data. Anything written to the old instance after the new one boots (a few seconds during a deploy) is lost, so avoid deploying during live test sessions.
- **Fail closed:** if a restore is needed but Redis can't be reached, the server refuses to start rather than starting empty and overwriting the backup.
- **Bounded loss:** on a crash (not a normal restart), up to one backup interval of changes can be lost.
- **Use a Redis that persists its data,** e.g. Upstash (free tier) or a paid Render Key Value. Render's free Key Value doesn't persist to disk.

Inspect it with `redis-cli`:

```bash
redis-cli -u "$REDIS_URL" GET bingo:db:generation
redis-cli -u "$REDIS_URL" GET bingo:db:snapshot:meta     # createdAt, bytes, sha256, generation
```

Restore manually (e.g. to inspect production data locally):

```bash
redis-cli -u "$REDIS_URL" --raw GET bingo:db:snapshot | base64 -d | gunzip > bingo.db
```

### Health checks

- `GET /api/health`: database, rooms, sockets, memory, plus launch flags (`database.persistentPathConfigured`, `payments.depositAccountConfigured`, `telegram.mode`)
- `GET /api/health/readiness`: used by Render's health check
- `GET /api/health/liveness`

---

## 🧪 Initial real-time testing tips

- Render's free instances sleep after ~15 minutes idle; the first request then takes ~50s. Open the app a minute before a test session.
- Testers on the same Wi-Fi share one IP for rate limiting. Raise `AUTH_RATE_LIMIT_PER_MINUTE` for group sessions.
- Without `REDIS_URL` or a disk, a redeploy on the free plan wipes all test accounts and balances.
