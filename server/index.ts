import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { MultiRoomManager } from './GameRoomManager.js';
import { ledgerService } from './LedgerService.js';
import { authService } from './AuthService.js';
import { telegramBotService } from './TelegramBotService.js';
import { computeCommitmentHash } from './BingoEngine.js';
import { databaseService } from './DatabaseService.js';
import { dailyJackpotService } from './DailyJackpotService.js';
import { hashPassword, verifyPassword } from './PasswordUtils.js';
import { formatLocalPhone, isValidEthiopianPhone } from './PhoneUtils.js';
import crypto from 'crypto';
import { leaderboardService } from './LeaderboardService.js';
import { authEndpointRateLimitMiddleware } from './RateLimiter.js';

// Synchronously load .env if present
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length > 0) {
          process.env[k.trim()] = v.join('=').trim();
        }
      }
    }
  }
} catch (e) {}

// CORS Whitelist and Origin Validator
const allowedOrigins = [
  'https://regions-burns-mile-dim.trycloudflare.com',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3001'
];

if (process.env.FRONTEND_URL) {
  const f = process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (!allowedOrigins.includes(f)) allowedOrigins.push(f);
}
if (process.env.WEBAPP_URL) {
  const w = process.env.WEBAPP_URL.replace(/\/+$/, '');
  if (!allowedOrigins.includes(w)) allowedOrigins.push(w);
}
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
    const trimmed = o.trim().replace(/\/+$/, '');
    if (trimmed && !allowedOrigins.includes(trimmed)) allowedOrigins.push(trimmed);
  });
}

export const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true; // Allow non-browser agents, curl, Telegram Webhook, mobile webviews
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  // Dynamically match any trycloudflare.com tunnel
  if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(normalized)) return true;
  // Dynamically match any localhost / 127.0.0.1 port
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  return false;
};

const app = express();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json());

// Verbose HTTP Request Logger for Dev & Telegram Mini App Auditing
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/' || req.path.endsWith('.html')) {
    console.log(`[HTTP] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  }
  next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const multiRoomManager = new MultiRoomManager(io);
telegramBotService.setSocketServer(io);
dailyJackpotService.setIo(io);
dailyJackpotService.startDailyScheduler();

// ---------------- REST API Endpoints ----------------

// ---------------- System Health, Liveness & Readiness Endpoints ----------------

// Comprehensive health check with DB, room, socket, and memory metrics
app.get('/api/health', (req, res) => {
  let isDbHealthy = false;
  try {
    const row = databaseService.getDb().prepare('SELECT 1 as healthy').get() as any;
    isDbHealthy = row?.healthy === 1;
  } catch (err) {
    isDbHealthy = false;
  }

  const roomSummaries = multiRoomManager.getLobbySummaries();
  const socketClientsCount = io.engine?.clientsCount || 0;
  const mem = process.memoryUsage();

  const responsePayload = {
    status: isDbHealthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    database: {
      status: isDbHealthy ? 'connected' : 'error',
      mode: 'WAL'
    },
    rooms: {
      total: roomSummaries.length,
      active: roomSummaries.filter(r => r.status === 'active').length,
      lobby: roomSummaries.filter(r => r.status === 'lobby').length
    },
    sockets: {
      connectedClients: socketClientsCount
    },
    system: {
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100
    }
  };

  res.status(isDbHealthy ? 200 : 503).json(responsePayload);
});

// Liveness probe (checks process responsiveness)
app.get('/api/health/liveness', (req, res) => {
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
});

// Readiness probe (checks database readiness for traffic)
app.get('/api/health/readiness', (req, res) => {
  try {
    const row = databaseService.getDb().prepare('SELECT 1 as ready').get() as any;
    if (row?.ready === 1) {
      return res.status(200).json({ status: 'ready', database: 'connected' });
    }
    return res.status(503).json({ status: 'not_ready', database: 'query_failed' });
  } catch (err: any) {
    return res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

// ---------------- Telegram Bot Webhook & Contact Verification ----------------

// Telegram Webhook receiver (for live bot updates)
app.post('/api/telegram/webhook', async (req, res) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // In production or whenever TELEGRAM_WEBHOOK_SECRET is set, reject unauthorized callers
  if (process.env.NODE_ENV === 'production' || configuredSecret) {
    if (!configuredSecret) {
      return res.status(500).json({ error: 'TELEGRAM_WEBHOOK_SECRET is not configured on server' });
    }
    if (!secretHeader || typeof secretHeader !== 'string') {
      return res.status(401).json({ error: 'Unauthorized: Missing X-Telegram-Bot-Api-Secret-Token header' });
    }
    const secretBuf = Buffer.from(secretHeader);
    const confBuf = Buffer.from(configuredSecret);
    if (secretBuf.length !== confBuf.length || !crypto.timingSafeEqual(secretBuf, confBuf)) {
      return res.status(403).json({ error: 'Forbidden: Invalid webhook secret token' });
    }
  }

  try {
    const result = await telegramBotService.handleWebhookUpdate(req.body);
    if (result && result.webhookResponse) {
      return res.json(result.webhookResponse);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Simulation endpoint for browser testing & automated test suite
app.post('/api/telegram/simulate-contact-share', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Simulation endpoints are permanently disabled in production' });
  }

  const { phone, expectedPhone, sharedPhone, tgUserId, username, isReset } = req.body;
  const targetExpected = expectedPhone || phone;
  if (!targetExpected) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  if (isReset) {
    const result = telegramBotService.simulatePasswordResetShare(targetExpected, sharedPhone || phone);
    if (!result.success) {
      return res.status(400).json({ error: result.error, denied: result.denied });
    }
    return res.json(result);
  }

  const result = telegramBotService.simulateContactShare(
    targetExpected,
    sharedPhone || phone,
    tgUserId || 12345678,
    username || 'TelegramTester'
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error, denied: result.denied });
  }
  res.json(result);
});

// ---------------- Authentication Middlewares ----------------

const authenticateSession = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = authService.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
};

const isSuperAdminRole = (role?: string) => role === 'SUPER_ADMIN' || role === 'ADMIN';
const isStaffRole = (role?: string) => role === 'AGENT' || role === 'SUPER_ADMIN' || role === 'ADMIN';

const requireSuperAdmin = (req: any, res: any, next: any) => {
  authenticateSession(req, res, () => {
    if (!isSuperAdminRole(req.user?.role)) {
      try {
        databaseService.logAgentActivity({
          actor_id: req.user?.playerId || req.user?.id || 'unknown',
          actor_role: req.user?.role || 'USER',
          action: 'FAILED_SUPER_ADMIN_AUTHORIZATION',
          ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
          metadata: { path: req.path, method: req.method }
        });
      } catch (err) {
        // Ignore logging error
      }
      return res.status(403).json({ error: 'Forbidden: Super Admin authorization required' });
    }
    next();
  });
};

const requireStaff = (req: any, res: any, next: any) => {
  authenticateSession(req, res, () => {
    if (!isStaffRole(req.user?.role)) {
      try {
        databaseService.logAgentActivity({
          actor_id: req.user?.playerId || req.user?.id || 'unknown',
          actor_role: req.user?.role || 'USER',
          action: 'FAILED_STAFF_AUTHORIZATION',
          ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
          metadata: { path: req.path, method: req.method }
        });
      } catch (err) {
        // Ignore logging error
      }
      return res.status(403).json({ error: 'Forbidden: Staff authorization required' });
    }
    next();
  });
};

const requireAdmin = (req: any, res: any, next: any) => {
  authenticateSession(req, res, () => {
    if (!isSuperAdminRole(req.user?.role)) {
      try {
        databaseService.logAgentActivity({
          actor_id: req.user?.playerId || req.user?.id || 'unknown',
          actor_role: req.user?.role || 'USER',
          action: 'FAILED_ADMIN_AUTHORIZATION',
          ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
          metadata: { path: req.path, method: req.method }
        });
      } catch (err) {
        // Ignore logging error
      }
      return res.status(403).json({ error: 'Forbidden: Admin authorization required' });
    }
    next();
  });
};

const optionalSession = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token) {
    const user = authService.getUserByToken(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
};

// ---------------- Authentication Endpoints ----------------

// Primary: Official Telegram WebApp HMAC Authentication
app.post('/api/auth/telegram', authEndpointRateLimitMiddleware, async (req, res) => {
  const { initData, referralCode } = req.body;
  if (!initData) {
    return res.status(400).json({ error: 'Missing Telegram initData' });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const result = await authService.authenticateTelegram(initData, botToken, referralCode);
  if (!result.success) {
    return res.status(401).json({ error: result.error, status: result.status });
  }
  res.json(result);
});

// Complete Registration (Atomic Transaction)
app.post('/api/auth/register', authEndpointRateLimitMiddleware, async (req, res) => {
  const authHeader = req.headers.authorization;
  const tempToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.body.tempToken || req.body.token);

  const { username, referralCode, name, phone, phoneNumber, password } = req.body;
  const targetPhone = phone || phoneNumber;
  const targetName = name || username;

  // Telegram registration flow with tempToken
  if (tempToken) {
    const chosenUsername = targetName;
    const result = await authService.completeRegistration(tempToken, chosenUsername, referralCode);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }

  if (!targetPhone || !password) {
    return res.status(400).json({ error: 'Phone number and password are required.' });
  }

  // Authoritative direct phone/password registration
  const result = authService.register(targetName || 'Player', targetPhone, password);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// Upgrade Guest Account to Real Account
app.post('/api/auth/upgrade-guest', authEndpointRateLimitMiddleware, optionalSession, (req: any, res) => {
  const guestPlayerId = req.body.guestPlayerId || req.body.playerId || req.user?.playerId || req.user?.id;
  const { phone, password, name } = req.body;

  if (!guestPlayerId || !phone || !password) {
    return res.status(400).json({ error: 'guestPlayerId, phone, and password are required.' });
  }

  const result = authService.upgradeGuestAccount(guestPlayerId, phone, password, name);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// Validate & Restore Session
app.get('/api/auth/session', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ valid: false, status: 'UNAUTHENTICATED' });
  }
  const result = authService.validateSession(token);
  if (!result.valid) {
    return res.status(401).json(result);
  }
  res.json(result);
});

// Get currently authenticated user from token
app.get('/api/auth/me', authenticateSession, (req: any, res) => {
  res.json({ success: true, user: req.user });
});

// Invalidate & Revoke Session (Logout)
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token) {
    authService.logout(token);
  }
  res.json({ success: true });
});

// 1a. Initiate Sign-Up Request (Strict Telegram Matching)
app.post('/api/auth/register-initiate', authEndpointRateLimitMiddleware, (req, res) => {
  const { name, phone, password } = req.body;
  const result = authService.initiateRegistration(name, phone, password);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// 1b. Check Registration Status (Polling)
app.get('/api/auth/registration-status/:target', (req, res) => {
  const result = authService.getRegistrationStatus(req.params.target);
  res.json(result);
});

// 2. Verify Phone number via Telegram / Code
app.post('/api/auth/verify', authEndpointRateLimitMiddleware, (req, res) => {
  const { phone, code } = req.body;
  const result = authService.verifyPhone(phone, code);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// 2b. Check phone verification status (Polling)
app.get('/api/auth/check-verification/:phone', (req, res) => {
  const result = authService.checkVerification(req.params.phone);
  res.json(result);
});

// 2c. Forgot Password - Initiate
app.post('/api/auth/forgot-password-initiate', authEndpointRateLimitMiddleware, (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  const result = authService.initiatePasswordReset(phone);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// 2d. Forgot Password - Status Polling
app.get('/api/auth/forgot-password-status/:phone', (req, res) => {
  const result = authService.getPasswordResetStatus(req.params.phone);
  res.json(result);
});

// 2e. Forgot Password - Complete with New Password
app.post('/api/auth/forgot-password-complete', authEndpointRateLimitMiddleware, (req, res) => {
  const { phone, resetToken, newPassword } = req.body;
  if (!phone || !resetToken || !newPassword) {
    return res.status(400).json({ error: 'Phone, resetToken, and newPassword are required' });
  }
  const result = authService.completePasswordReset(phone, resetToken, newPassword);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// 3. Login with Phone + Password
app.post('/api/auth/login', authEndpointRateLimitMiddleware, (req, res) => {
  const phone = req.body.phone || req.body.phoneNumber;
  const password = req.body.password;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone number and password are required.' });
  }

  const result = authService.login(phone, password);
  if (!result.success) {
    const status = result.error?.includes('suspended') ? 403 : result.error?.includes('Too many') ? 429 : 401;
    return res.status(status).json({ error: result.error });
  }
  res.json(result);
});

// 3b. Change Password (Authenticated)
app.post('/api/auth/change-password', authenticateSession, (req: any, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  if (confirmPassword && newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const user = databaseService.getUserById(req.user.playerId || req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const verify = verifyPassword(currentPassword, user.password_hash, user.password_salt);
  if (!verify.isValid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const { hash, salt } = hashPassword(newPassword);
  databaseService.updateUser(user.id, {
    password_hash: hash,
    password_salt: salt
  });

  res.json({ success: true, message: 'Password changed successfully.' });
});

// 4. Telegram 1-Tap Login (Restricted legacy fallback for local tests only)
app.post('/api/auth/telegram-login', (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    return res.status(403).json({
      error: 'Direct unverified Telegram login is disabled. Please authenticate via the official Telegram WebApp HMAC endpoint (/api/auth/telegram).'
    });
  }
  const { id, username, first_name, last_name, photo_url } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing Telegram user ID' });
  }
  const result = authService.telegramLogin({ id, username, first_name, last_name, photo_url });
  if (!result.success) {
    return res.status(403).json({ error: result.error });
  }
  res.json(result);
});

// Sync or fetch Telegram / Web user
app.post('/api/user/sync', optionalSession, (req: any, res) => {
  const currentUserId = req.user?.playerId;
  const targetId = currentUserId || req.body.playerId;
  if (!targetId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isGuest = !req.user && (req.body.isGuest || !req.body.telegramId);
  const accountType = isGuest ? 'GUEST' : (req.body.isBot ? 'BOT' : 'REAL');

  const user = ledgerService.getOrCreateUser(
    targetId,
    req.body.username || (isGuest ? `Guest_${targetId.slice(-4)}` : 'TelegramPlayer'),
    req.body.avatarUrl,
    'USER',
    0.00,
    accountType
  );
  res.json({ success: true, user });
});

// Dedicated authenticated profile endpoint (Identity strictly from session/token)
app.get('/api/profile', authenticateSession, (req: any, res) => {
  const profile = authService.getFullProfile(req.user.playerId);
  if (!profile) {
    return res.status(404).json({ error: 'User profile not found' });
  }
  res.json({ profile });
});

// Fetch full user profile & stats (Secured with session authorization & IDOR prevention)
app.get('/api/user/profile/:playerId?', optionalSession, (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const requestedId = req.params.playerId;
  const currentUserId = req.user.playerId;

  // IDOR Protection: Strictly reject requesting another user's profile
  if (requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot access another user\'s private profile' });
  }

  const profile = authService.getFullProfile(currentUserId);
  if (!profile) {
    const fallbackUser = ledgerService.getUser(currentUserId);
    if (!fallbackUser) return res.status(404).json({ error: 'User not found' });
    return res.json({
      profile: {
        ...fallbackUser,
        phone: fallbackUser.phone || null,
        totalGamesPlayed: 0,
        totalWonETB: 0,
        currentStreak: 0,
        xp: 0,
        level: 1,
        levelProgressXp: 0,
        levelTotalXp: 500,
        levelPercent: 0,
        vipTier: 'BRONZE VIP'
      }
    });
  }
  res.json({ profile });
});

// Fetch user account and balance
app.get('/api/user/:playerId?', optionalSession, (req: any, res) => {
  const requestedId = req.params.playerId;
  const currentUserId = req.user?.playerId;

  if (currentUserId && requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot access another user\'s balance' });
  }

  const targetPlayerId = requestedId || currentUserId;
  if (!targetPlayerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = ledgerService.getUser(targetPlayerId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// Get user transaction ledger
app.get('/api/ledger/:playerId?', optionalSession, (req: any, res) => {
  const requestedId = req.params.playerId;
  const currentUserId = req.user?.playerId;

  if (currentUserId && requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot access another user\'s ledger' });
  }

  const targetPlayerId = requestedId || currentUserId;
  if (!targetPlayerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const entries = ledgerService.getLedgerForUser(targetPlayerId);
  res.json({ entries });
});

// Deposit funds (Strict Telebirr-Only with Reference Validation)
app.post('/api/wallet/deposit', authenticateSession, async (req: any, res) => {
  const { amount } = req.body;
  const requestedId = req.body.playerId;
  const currentUserId = req.user?.playerId;

  // IDOR Protection: Reject attempts to deposit to another user's account
  if (requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot perform financial operations on another account' });
  }

  const targetPlayerId = currentUserId;

  try {
    const paymentMethod = req.body.paymentMethod;
    if (paymentMethod && paymentMethod !== 'Telebirr') {
      return res.status(400).json({ error: 'Telebirr is the only supported payment method' });
    }

    const rawAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) {
      return res.status(400).json({ error: 'Invalid deposit amount: must be a valid number' });
    }
    const depositAmount = Math.round(rawAmount * 100) / 100;
    if (depositAmount < 10) {
      return res.status(400).json({ error: 'Minimum deposit amount is 10 Birr' });
    }
    if (depositAmount > 50000) {
      return res.status(400).json({ error: 'Maximum single deposit amount is 50,000 Birr' });
    }

    // Capture user-submitted Telebirr Transaction Reference / Receipt ID
    const rawRef = req.body.referenceId || req.body.telebirrReference || req.body.paymentReference;
    const cleanRef = typeof rawRef === 'string' && rawRef.trim().length > 0 ? rawRef.trim() : undefined;
    if (cleanRef && cleanRef.length > 64) {
      return res.status(400).json({ error: 'Telebirr transaction reference cannot exceed 64 characters' });
    }

    const userObj = ledgerService.getUser(targetPlayerId);
    const depositReq = ledgerService.createDepositRequest(
      targetPlayerId,
      userObj?.username || req.user.username || 'Player',
      depositAmount,
      'Telebirr',
      cleanRef
    );

    // Real-time broadcast to authorized agents & super admin (staff_room)
    io.to('staff_room').emit('deposit:new', depositReq);

    res.json({
      success: true,
      deposit: depositReq,
      request: depositReq,
      user: ledgerService.getUser(targetPlayerId),
      message: 'Deposit request submitted via Telebirr. Pending admin verification.'
    });
  } catch (err: any) {
    console.error('[Wallet] Deposit request error:', err);
    const msg = err.message || '';
    if (msg.includes('already been submitted or credited')) {
      return res.status(409).json({ success: false, error: msg });
    }
    if (
      msg.includes('Deposit amount must be greater than zero') ||
      msg.includes('Minimum deposit amount') ||
      msg.includes('Maximum single deposit amount') ||
      msg.includes('Telebirr is the only supported payment method') ||
      msg.includes('Invalid deposit amount') ||
      msg.includes('Telebirr transaction reference cannot exceed')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    res.status(400).json({ success: false, error: 'Your deposit request could not be processed. Please try again or contact support.' });
  }
});

// Withdraw funds (Strict Telebirr-Only with Ethiopian Phone Validation)
app.post('/api/wallet/withdraw', authenticateSession, async (req: any, res) => {
  const { amount } = req.body;
  const requestedId = req.body.playerId;
  const currentUserId = req.user?.playerId;

  // IDOR Protection: Reject attempts to withdraw from another user's account
  if (requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ success: false, error: 'Access denied: Cannot perform financial operations on another account' });
  }

  const targetPlayerId = currentUserId;

  try {
    const paymentMethod = req.body.paymentMethod;
    if (paymentMethod && paymentMethod !== 'Telebirr') {
      return res.status(400).json({ success: false, error: 'Telebirr is the only supported payment method' });
    }

    const rawAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) {
      return res.status(400).json({ success: false, error: 'Invalid withdrawal amount: must be a valid number' });
    }
    const withdrawAmount = Math.round(rawAmount * 100) / 100;
    if (withdrawAmount < 10) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal amount is 10 Birr' });
    }
    if (withdrawAmount > 50000) {
      return res.status(400).json({ success: false, error: 'Maximum single withdrawal amount is 50,000 Birr' });
    }

    // Telebirr Account Phone validation
    const rawAddress = req.body.address || req.body.withdrawAddress || req.body.phone;
    if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
      return res.status(400).json({ success: false, error: 'Telebirr account phone number is required' });
    }
    const normalizedPhone = authService.normalizePhone(rawAddress.trim());
    const localTelebirrPhone = formatLocalPhone(normalizedPhone) || normalizedPhone;
    if (!/^(09|07)\d{8}$/.test(localTelebirrPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Telebirr phone number. Must be a valid Ethiopian mobile number (09xxxxxxxx or 07xxxxxxxx)'
      });
    }

    const userObj = ledgerService.getUser(targetPlayerId);
    if (!userObj) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }
    if (userObj.isBot || userObj.account_type === 'BOT') {
      return res.status(403).json({ success: false, error: 'Automated or bot accounts cannot request withdrawals' });
    }
    if (userObj.account_type === 'GUEST') {
      return res.status(403).json({ success: false, error: 'Guest accounts cannot request withdrawals. Please complete account registration.' });
    }
    if (userObj.account_status === 'BANNED' || userObj.account_status === 'SUSPENDED' || userObj.account_status === 'DELETED') {
      return res.status(403).json({ success: false, error: `Account is ${userObj.account_status.toLowerCase()}. Withdrawals are prohibited.` });
    }
    if (userObj.registration_status === 'PENDING') {
      return res.status(403).json({ success: false, error: 'Please complete phone verification before requesting a withdrawal' });
    }

    // Balance is atomically reserved and held; status is PENDING
    const withdrawalReq = ledgerService.createWithdrawalRequest(
      targetPlayerId,
      userObj?.username || req.user.username || 'Player',
      withdrawAmount,
      localTelebirrPhone
    );

    // Real-time broadcast to authorized agents & super admin (staff_room)
    io.to('staff_room').emit('withdrawal:new', withdrawalReq);

    res.json({
      success: true,
      withdrawal: withdrawalReq,
      request: withdrawalReq,
      user: ledgerService.getUser(targetPlayerId),
      message: 'Withdrawal request submitted for Telebirr payout. Balance reserved pending admin review.'
    });
  } catch (err: any) {
    console.error('[Wallet] Withdrawal request error:', err);
    const msg = err.message || '';
    if (
      msg.includes('Insufficient funds') ||
      msg.includes('Withdrawal amount must be greater than zero') ||
      msg.includes('Minimum withdrawal amount') ||
      msg.includes('Maximum single withdrawal amount') ||
      msg.includes('Telebirr account phone number is required') ||
      msg.includes('Invalid Telebirr phone number') ||
      msg.includes('Telebirr is the only supported payment method') ||
      msg.includes('Invalid withdrawal amount') ||
      msg.includes('Automated or bot') ||
      msg.includes('Guest accounts') ||
      msg.includes('Account is') ||
      msg.includes('verification')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    res.status(400).json({ success: false, error: 'Your withdrawal request could not be processed. Please try again or contact support.' });
  }
});

// Promotional Rewards System V2: Get active promotional bonus details for current user
app.get('/api/rewards/my-bonus', optionalSession, (req: any, res) => {
  const userId = req.user?.playerId || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const data = databaseService.rewardService.getUserActiveBonus(userId);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Daily Grand Jackpot (Server-Authoritative) ----------------

// Get current public Daily Grand Jackpot state (Player safe: NEVER exposes platform cut)
app.get('/api/daily-jackpot/current', optionalSession, (req: any, res) => {
  try {
    const currentUserId = req.user?.playerId || req.user?.id;
    const state = dailyJackpotService.getPublicState(currentUserId);
    res.json({ success: true, ...state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get cards catalog status (1..200) for Daily Grand Jackpot
app.get('/api/daily-jackpot/cards', optionalSession, (req: any, res) => {
  try {
    const currentUserId = req.user?.playerId || req.user?.id;
    const roundId = req.query.roundId as string | undefined;
    const cards = dailyJackpotService.getCardsCatalogStatus(roundId, currentUserId);
    res.json({ success: true, cards });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Purchase Daily Grand Jackpot cards (Atomic, 999 ETB per card)
app.post('/api/daily-jackpot/purchase', optionalSession, (req: any, res) => {
  try {
    const currentUserId = req.user?.playerId || req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required to purchase Daily Grand Jackpot cards' });
    }

    const { cardNumbers } = req.body;
    if (!Array.isArray(cardNumbers) || cardNumbers.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of cardNumbers to purchase (1-200)' });
    }

    const username = req.user?.username || 'Player';
    const result = dailyJackpotService.purchaseCards(currentUserId, username, cardNumbers);

    res.json({
      message: `Successfully purchased ${cardNumbers.length} card(s) for the Daily Grand Jackpot!`,
      ...result,
      user: ledgerService.getUser(currentUserId)
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// List all rooms for Lobby Table
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: multiRoomManager.getLobbySummaries() });
});

// Get specific room state
app.get('/api/room/:roomId', (req, res) => {
  const room = multiRoomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.getPublicState());
});

// Get 5x5 Grid Preview for a card number
app.get('/api/room/:roomId/card/:cardNumber', (req, res) => {
  const room = multiRoomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const cardNumber = parseInt(req.params.cardNumber, 10);
  const grid = room.getCardPreview(cardNumber);
  if (!grid) {
    return res.status(404).json({ error: 'Card not found' });
  }
  res.json({ cardNumber, grid });
});

// Get all card previews for a room
app.get('/api/room/:roomId/catalog', (req, res) => {
  const room = multiRoomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const catalogObj: Record<number, any> = {};
  const total = room.getPublicState().totalCatalogCards || 100;
  for (let i = 1; i <= total; i++) {
    const grid = room.getCardPreview(i);
    if (grid) catalogObj[i] = grid;
  }
  res.json({ roomId: req.params.roomId, catalog: catalogObj });
});

// Leaderboard: Top Winners and High-Rollers (Authoritative database-backed)
app.get('/api/leaderboard', optionalSession, (req: any, res) => {
  try {
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
    const currentUserId = req.user?.playerId || req.user?.id;

    const data = leaderboardService.getLeaderboardData(currentUserId, limit);
    res.json({
      success: true,
      topWinners: data.topWinners,
      recentJackpots: data.recentJackpots,
      currentUserRank: data.currentUserRank
    });
  } catch (err: any) {
    console.error('[API /api/leaderboard] Error fetching authoritative leaderboard:', err);
    res.status(500).json({ error: 'Failed to fetch authoritative leaderboard data' });
  }
});

// Authoritative Unified Rewards API
app.get('/api/rewards', authenticateSession, (req: any, res) => {
  const userId = req.user.playerId;
  try {
    const summary = databaseService.rewardService.getUserRewardsSummary(userId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rewards/claim', authenticateSession, (req: any, res) => {
  const userId = req.user.playerId;
  const { rewardType, roomId } = req.body;

  if (!rewardType) {
    return res.status(400).json({ error: 'Missing rewardType. Must be FIRST_DEPOSIT, ROOM_PLAY, or REFERRAL.' });
  }

  try {
    let result: any;
    databaseService.transaction(() => {
      if (rewardType === 'FIRST_DEPOSIT') {
        result = databaseService.rewardService.claimFirstDepositReward(userId);
      } else if (rewardType === 'ROOM_PLAY') {
        if (!roomId) {
          throw new Error('roomId is required to claim room play rewards');
        }
        result = databaseService.rewardService.claimRoomPlayReward(userId, roomId);
      } else if (rewardType === 'REFERRAL') {
        result = databaseService.rewardService.claimReferralRewards(userId);
      } else {
        throw new Error(`Unknown reward type: ${rewardType}`);
      }
    });

    const updatedSummary = databaseService.rewardService.getUserRewardsSummary(userId);
    res.json({
      success: true,
      claimResult: result,
      summary: updatedSummary
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Referral & Affiliate Income (Authoritative 10 ETB per qualified deposit)
app.get('/api/referral/:playerId?', optionalSession, (req: any, res) => {
  const currentUserId = req.user?.playerId;
  const requestedId = req.params.playerId;

  if (currentUserId && requestedId && requestedId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot access another user\'s referral data' });
  }

  const targetId = requestedId || currentUserId;
  if (!targetId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const refStats = databaseService.rewardService.getReferralRewards(targetId);
  res.json({
    referralCode: refStats.referralCode,
    referralLink: refStats.referralLink,
    totalInvited: refStats.totalInvited,
    activeReferrals: refStats.qualifiedCount,
    qualifiedCount: refStats.qualifiedCount,
    claimedCount: refStats.claimedCount,
    unclaimedCount: refStats.unclaimedCount,
    totalEarnedUSD: 0,
    totalEarnedETB: Number((refStats.claimedCount * 10.0).toFixed(2)),
    pendingClaimUSD: 0,
    pendingClaimETB: refStats.availableRewardAmount,
    commissionRate: '10 ETB per qualifying deposit'
  });
});

// Claim Referral Earnings (Authenticated, Atomic & Idempotent)
app.post('/api/referral/claim', authenticateSession, async (req: any, res) => {
  const currentUserId = req.user?.playerId;
  const { playerId } = req.body;

  if (playerId && playerId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot claim earnings for another user' });
  }

  const targetPlayerId = currentUserId;
  if (!targetPlayerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let claimResult: any;
    databaseService.transaction(() => {
      claimResult = databaseService.rewardService.claimReferralRewards(targetPlayerId);
    });

    const user = ledgerService.getUser(targetPlayerId);
    res.json({
      success: true,
      claimedAmountETB: claimResult.rewardAmount,
      claimedAmount: claimResult.rewardAmount,
      qualifiedClaimed: claimResult.qualifiedClaimed,
      bonusBalance: claimResult.bonusBalance,
      user
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message,
      claimedAmountETB: 0
    });
  }
});

// Provably Fair Audit Verifier tool
app.post('/api/game/verify-fairness', (req, res) => {
  const { balls, serverSeed, expectedHash, gameId } = req.body;

  // Support lookup by gameId for finished games
  if (gameId && typeof gameId === 'string') {
    const game = databaseService.getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (game.status !== 'finished') {
      return res.status(400).json({ error: 'Game is currently active or in lobby. Seeds and full ball order are strictly confidential until the game concludes.' });
    }
    return res.json({
      gameId: game.id,
      commitmentHash: game.commitment_hash,
      status: game.status,
      message: 'Game commitment hash retrieved. Enter revealed server seed and ball sequence to audit.'
    });
  }

  if (!Array.isArray(balls) || balls.length === 0 || !serverSeed || typeof serverSeed !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid parameters: balls must be a non-empty array of integers (1..75) and serverSeed must be a valid string' });
  }

  // Validate that all numbers are unique integers between 1 and 75
  const ballSet = new Set(balls);
  if (ballSet.size !== balls.length || balls.some(b => typeof b !== 'number' || !Number.isInteger(b) || b < 1 || b > 75)) {
    return res.status(400).json({ error: 'Invalid ball sequence: numbers must be unique integers between 1 and 75' });
  }

  const calculatedHash = computeCommitmentHash(balls, serverSeed);
  const isValid = expectedHash ? calculatedHash.toLowerCase() === expectedHash.trim().toLowerCase() : true;
  res.json({
    calculatedHash,
    expectedHash: expectedHash ? expectedHash.trim() : calculatedHash,
    isValid,
    message: isValid
      ? 'Cryptographic commitment verified: No server manipulation detected. Sequence exactly matches commitment hash.'
      : 'Hash mismatch: Verification failed. The supplied balls or seed do not match the commitment hash.'
  });
});

// ---------------- Admin REST API Endpoints (Strict Server-Side Role Enforcement) ----------------

// Verify Admin Status endpoint - Requires valid session with role ADMIN
app.get('/api/admin/verify', requireAdmin, (req: any, res) => {
  res.json({ success: true, role: 'ADMIN', user: req.user });
});

// 1. Get all users with optional filtering
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const filter = req.query.filter as string | undefined;
  const users = authService.getAllUsers(filter);
  res.json({ success: true, users });
});

// 2. Update user status (suspend, ban, activate) - Support PUT and POST
const updateUserStatusHandler = (req: any, res: any) => {
  const { status } = req.body;
  if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be ACTIVE, SUSPENDED, or BANNED.' });
  }
  try {
    const user = authService.updateUserStatus(req.user.playerId, req.params.playerId, status);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
app.put('/api/admin/users/:playerId/status', requireAdmin, updateUserStatusHandler);
app.post('/api/admin/users/:playerId/status', requireAdmin, updateUserStatusHandler);

// 3. Get deposits
app.get('/api/admin/deposits', requireAdmin, (req, res) => {
  const status = req.query.status as string;
  const deposits = ledgerService.getDepositRequests(status);
  res.json({ success: true, deposits });
});

// 4. Approve deposit
app.post('/api/admin/deposits/:id/approve', requireAdmin, async (req: any, res) => {
  try {
    const result = await ledgerService.approveDeposit(req.user.playerId, req.params.id);
    const targetUserId = result.deposit.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    let message = `Your deposit of ${result.deposit.amount} ETB has been approved!`;
    if (result.promotionalBonus) {
      message += ` You received a 10% First Deposit Bonus of ${result.promotionalBonus.bonusAmount.toFixed(2)} ETB (valid 24h for Bingo)!`;
    }

    // Instant real-time push to Customer's active WebSocket room
    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      bonusBalance: wallet.bonus_balance || 0,
      totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
      promotionalBonus: result.promotionalBonus || null,
      type: 'DEPOSIT',
      amount: result.deposit.amount,
      referenceId: result.deposit.referenceId,
      status: 'APPROVED',
      message
    });

    res.json({
      success: true,
      ...result,
      request: result.deposit,
      wallet,
      promotionalBonus: result.promotionalBonus || null
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Reject deposit
app.post('/api/admin/deposits/:id/reject', requireAdmin, (req: any, res) => {
  const { reason } = req.body;
  try {
    const deposit = ledgerService.rejectDeposit(req.user.playerId, req.params.id, reason);
    const targetUserId = deposit.playerId;

    // Notify customer of rejected deposit
    io.to(`user_${targetUserId}`).emit('DEPOSIT_REJECTED', {
      playerId: targetUserId,
      depositId: deposit.id,
      amount: deposit.amount,
      reason: deposit.rejectionReason,
      message: `Deposit request of ${deposit.amount} ETB was rejected: ${deposit.rejectionReason || 'Declined by admin'}`
    });

    res.json({ success: true, deposit, request: deposit });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Get withdrawals
app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
  const status = req.query.status as string;
  const withdrawals = ledgerService.getWithdrawalRequests(status);
  res.json({ success: true, withdrawals });
});

// 7. Approve withdrawal
app.post('/api/admin/withdrawals/:id/approve', requireAdmin, async (req: any, res) => {
  try {
    const result = await ledgerService.approveWithdrawal(req.user.playerId, req.params.id);
    const targetUserId = result.withdrawal.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    // Instant real-time push to Customer's active WebSocket room
    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      bonusBalance: wallet.bonus_balance || 0,
      totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
      type: 'WITHDRAWAL',
      amount: result.withdrawal.amount,
      status: 'APPROVED',
      message: `Your withdrawal of ${result.withdrawal.amount} ETB has been approved & processed!`
    });

    res.json({ success: true, ...result, request: result.withdrawal, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Reject withdrawal
app.post('/api/admin/withdrawals/:id/reject', requireAdmin, (req: any, res) => {
  const { reason } = req.body;
  try {
    const withdrawal = ledgerService.rejectWithdrawal(req.user.playerId, req.params.id, reason);
    const targetUserId = withdrawal.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    // Instant real-time push of refunded balance to Customer's active WebSocket room
    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      type: 'REFUND',
      amount: withdrawal.amount,
      status: 'REJECTED',
      message: `Withdrawal of ${withdrawal.amount} ETB was rejected. Reserved funds refunded to your balance.`
    });

    res.json({ success: true, withdrawal, request: withdrawal, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Get all transactions / ledger
app.get('/api/admin/transactions', requireAdmin, (req, res) => {
  const entries = ledgerService.getAllLedgerEntries();
  res.json({ success: true, entries, transactions: entries });
});

// 10. Manual balance adjustment
app.post('/api/admin/balance-adjustment', requireAdmin, async (req: any, res) => {
  const { targetPlayerId, amount, reason } = req.body;
  if (!targetPlayerId || typeof amount !== 'number' || !reason) {
    return res.status(400).json({ error: 'targetPlayerId, numeric amount, and reason are required' });
  }
  try {
    const result = await ledgerService.manualBalanceAdjustment(req.user.playerId, targetPlayerId, amount, reason);
    const wallet = databaseService.getOrCreateWallet(targetPlayerId);

    // Instant real-time push of adjusted balance to Customer
    io.to(`user_${targetPlayerId}`).emit('WALLET_UPDATED', {
      playerId: targetPlayerId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      type: 'ADMIN_ADJUSTMENT',
      amount,
      message: `Balance adjusted by admin: ${amount > 0 ? '+' : ''}${amount} ETB (${reason})`
    });

    res.json({ success: true, ...result, newBalance: result.user.walletBalance, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Get games overview
app.get('/api/admin/games', requireAdmin, (req, res) => {
  const rooms = multiRoomManager.getLobbySummaries();
  res.json({ success: true, rooms, games: rooms });
});

// 12. Get audit logs
app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const auditLogs = ledgerService.getAuditLogs(limit);
  res.json({ success: true, auditLogs, logs: auditLogs });
});

// 13. Daily Grand Jackpot Admin Overview (Includes internal accounting data)
app.get('/api/admin/daily-jackpot', requireAdmin, (req, res) => {
  try {
    const state = dailyJackpotService.getAdminState();
    res.json({ success: true, ...state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Daily Grand Jackpot Admin Force Evaluation (For testing and operations)
app.post('/api/admin/daily-jackpot/evaluate', requireAdmin, (req: any, res) => {
  try {
    const { roundId } = req.body;
    const result = dailyJackpotService.evaluateDailyJackpot(roundId);

    databaseService.recordAuditLog({
      adminUserId: req.user.playerId || req.user.id,
      action: 'ADMIN_TRIGGERED_DAILY_JACKPOT_EVALUATION',
      targetRecordId: result.round.id,
      metadata: {
        status: result.status,
        cardsSold: result.round.cards_sold,
        jackpotAmount: result.round.jackpot_amount,
        winner: result.winner
      }
    });

    res.json({ ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 15. Promotional Rewards Admin Overview
app.get('/api/admin/rewards', requireAdmin, (req, res) => {
  try {
    const status = req.query.status as string;
    const rewards = databaseService.rewardService.listAllRewards(status);
    res.json({ success: true, rewards });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Public Payment Account Endpoints ----------------
app.get('/api/payment/active-account', (req, res) => {
  try {
    const account = databaseService.getActivePaymentAccount();
    if (!account) {
      return res.json({
        success: true,
        account: {
          id: 'acc_telebirr_primary',
          provider: 'Telebirr',
          account_name: 'Official Platform Account',
          phone_number: '0912345678',
          instructions: 'Send your deposit via Telebirr, then enter your transaction/reference number below.'
        }
      });
    }
    res.json({
      success: true,
      account: {
        id: account.id,
        provider: account.provider,
        account_name: account.account_name,
        phone_number: account.phone_number,
        assigned_agent_name: account.assigned_agent_name,
        instructions: account.instructions
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Staff / Agent Dedicated Operational Endpoints (requireStaff) ----------------

app.get('/api/staff/me', requireStaff, (req: any, res) => {
  try {
    const user = databaseService.getUserById(req.user.playerId || req.user.id);
    if (!user) return res.status(404).json({ error: 'Staff user not found' });
    const stats = user.role === 'AGENT' ? databaseService.getAgentPerformance(user.id) : null;
    const profile = {
      id: user.id,
      username: user.username,
      phone: user.phone,
      telebirr_number: user.telebirr_number || user.phone,
      assigned_agent_name: user.assigned_agent_name || user.username,
      role: user.role,
      account_status: user.account_status,
      stats
    };
    const activePaymentAccount = databaseService.getActivePaymentAccount();
    res.json({
      success: true,
      user: profile,
      profile,
      activePaymentAccount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/staff/deposits', requireStaff, (req: any, res) => {
  try {
    const status = req.query.status as string;
    const deposits = ledgerService.getDepositRequests(status);
    databaseService.logAgentActivity({
      actor_id: req.user.playerId || req.user.id,
      actor_role: req.user.role,
      action: 'VIEW_DEPOSITS',
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { filter: status }
    });
    res.json({ success: true, deposits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/deposits/:id/approve', requireStaff, async (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const result = await ledgerService.approveDeposit(actorId, req.params.id);
    const targetUserId = result.deposit.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'DEPOSIT_APPROVED',
      target_id: req.params.id,
      target_user_id: targetUserId,
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { amount: result.deposit.amount, referenceId: result.deposit.referenceId }
    });

    let message = `Your deposit of ${result.deposit.amount} ETB has been approved!`;
    if (result.promotionalBonus) {
      message += ` You received a 10% First Deposit Bonus of ${result.promotionalBonus.bonusAmount.toFixed(2)} ETB (valid 24h for Bingo)!`;
    }

    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      bonusBalance: wallet.bonus_balance || 0,
      totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
      promotionalBonus: result.promotionalBonus || null,
      type: 'DEPOSIT',
      amount: result.deposit.amount,
      referenceId: result.deposit.referenceId,
      status: 'APPROVED',
      message
    });

    // Real-time broadcast to all agents & super admin: deposit:updated
    io.to('staff_room').emit('deposit:updated', {
      id: req.params.id,
      status: 'APPROVED',
      processedBy: req.user.username || actorId,
      processedAt: result.deposit.processedAt || (result.deposit as any).processed_at || new Date().toISOString(),
      deposit: result.deposit
    });

    res.json({
      success: true,
      ...result,
      request: result.deposit,
      wallet,
      promotionalBonus: result.promotionalBonus || null
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/staff/deposits/:id/reject', requireStaff, (req: any, res) => {
  const { reason } = req.body;
  try {
    const actorId = req.user.playerId || req.user.id;
    const deposit = ledgerService.rejectDeposit(actorId, req.params.id, reason);
    const targetUserId = deposit.playerId;

    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'DEPOSIT_REJECTED',
      target_id: req.params.id,
      target_user_id: targetUserId,
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { amount: deposit.amount, reason }
    });

    io.to(`user_${targetUserId}`).emit('DEPOSIT_REJECTED', {
      playerId: targetUserId,
      depositId: deposit.id,
      amount: deposit.amount,
      reason: deposit.rejectionReason,
      message: `Deposit request of ${deposit.amount} ETB was rejected: ${deposit.rejectionReason || 'Declined by agent'}`
    });

    // Real-time broadcast to all agents & super admin: deposit:updated
    io.to('staff_room').emit('deposit:updated', {
      id: req.params.id,
      status: 'REJECTED',
      processedBy: req.user.username || actorId,
      rejectionReason: deposit.rejectionReason,
      deposit
    });

    res.json({ success: true, deposit, request: deposit });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/staff/deposits/:id/assign', requireStaff, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const targetAgentId = req.body.agentId || req.body.agent_id || actorId;
    const updated = databaseService.assignDepositToAgent(req.params.id, targetAgentId);
    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'DEPOSIT_ASSIGNED',
      target_id: req.params.id,
      metadata: { assigned_to: targetAgentId }
    });
    const mapped = {
      ...updated,
      assignedAgentId: updated.assigned_agent_id
    };

    // Real-time broadcast: deposit:updated
    io.to('staff_room').emit('deposit:updated', {
      id: req.params.id,
      status: mapped.status,
      assignedAgentId: targetAgentId,
      deposit: mapped
    });

    res.json({ success: true, deposit: mapped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/staff/withdrawals', requireStaff, (req: any, res) => {
  try {
    const status = req.query.status as string;
    const withdrawals = ledgerService.getWithdrawalRequests(status);
    databaseService.logAgentActivity({
      actor_id: req.user.playerId || req.user.id,
      actor_role: req.user.role,
      action: 'VIEW_WITHDRAWALS',
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { filter: status }
    });
    res.json({ success: true, withdrawals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/withdrawals/:id/approve', requireStaff, async (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const result = await ledgerService.approveWithdrawal(actorId, req.params.id);
    const targetUserId = result.withdrawal.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'WITHDRAWAL_APPROVED',
      target_id: req.params.id,
      target_user_id: targetUserId,
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { amount: result.withdrawal.amount, address: result.withdrawal.address }
    });

    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      bonusBalance: wallet.bonus_balance || 0,
      totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
      type: 'WITHDRAWAL',
      amount: result.withdrawal.amount,
      status: 'APPROVED',
      message: `Your withdrawal of ${result.withdrawal.amount} ETB has been approved & processed!`
    });

    // Real-time broadcast to all agents & super admin: withdrawal:updated
    io.to('staff_room').emit('withdrawal:updated', {
      id: req.params.id,
      status: 'APPROVED',
      processedBy: req.user.username || actorId,
      processedAt: result.withdrawal.processedAt || (result.withdrawal as any).processed_at || new Date().toISOString(),
      withdrawal: result.withdrawal
    });

    res.json({ success: true, ...result, request: result.withdrawal, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/staff/withdrawals/:id/reject', requireStaff, (req: any, res) => {
  const { reason } = req.body;
  try {
    const actorId = req.user.playerId || req.user.id;
    const withdrawal = ledgerService.rejectWithdrawal(actorId, req.params.id, reason);
    const targetUserId = withdrawal.playerId;
    const wallet = databaseService.getOrCreateWallet(targetUserId);

    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'WITHDRAWAL_REJECTED',
      target_id: req.params.id,
      target_user_id: targetUserId,
      ip_address: req.ip || req.headers['x-forwarded-for'] || undefined,
      metadata: { amount: withdrawal.amount, reason }
    });

    io.to(`user_${targetUserId}`).emit('WALLET_UPDATED', {
      playerId: targetUserId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      type: 'REFUND',
      amount: withdrawal.amount,
      status: 'REJECTED',
      message: `Withdrawal of ${withdrawal.amount} ETB was rejected. Reserved funds refunded to your balance.`
    });

    // Real-time broadcast to all agents & super admin: withdrawal:updated
    io.to('staff_room').emit('withdrawal:updated', {
      id: req.params.id,
      status: 'REJECTED',
      processedBy: req.user.username || actorId,
      rejectionReason: withdrawal.rejectionReason,
      withdrawal
    });

    res.json({ success: true, withdrawal, request: withdrawal, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/staff/withdrawals/:id/assign', requireStaff, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const targetAgentId = req.body.agentId || actorId;
    const updated = databaseService.assignWithdrawalToAgent(req.params.id, targetAgentId);
    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'WITHDRAWAL_ASSIGNED',
      target_id: req.params.id,
      metadata: { assigned_to: targetAgentId }
    });

    // Real-time broadcast: withdrawal:updated
    io.to('staff_room').emit('withdrawal:updated', {
      id: req.params.id,
      status: updated.status,
      assignedAgentId: targetAgentId,
      withdrawal: updated
    });

    res.json({ success: true, withdrawal: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/staff/customers', requireStaff, (req: any, res) => {
  try {
    const search = (req.query.search || req.query.query) as string;
    const rawUsers = authService.getAllUsers(search);
    const customers = rawUsers
      .filter((u) => u.role === 'USER' || !u.role)
      .map((u) => {
        const stats = databaseService.getUserFinancialStats(u.id);
        return {
          id: u.id,
          username: u.username,
          phone: u.phone,
          account_status: u.account_status,
          created_at: u.created_at,
          last_activity: stats.last_activity,
          balance: u.walletBalance || 0,
          total_deposited: stats.total_deposited,
          total_withdrawn: stats.total_withdrawn,
          pending_deposits_count: stats.pending_deposits_count,
          pending_withdrawals_count: stats.pending_withdrawals_count,
          bingo_purchases: stats.bingo_purchases,
          jackpot_cards_purchased: stats.jackpot_cards_purchased
        };
      });
    res.json({ success: true, customers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/staff/customers/:id', requireStaff, (req: any, res) => {
  try {
    const detail = databaseService.getUserDetailedProfile(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Customer not found' });
    databaseService.logAgentActivity({
      actor_id: req.user.playerId || req.user.id,
      actor_role: req.user.role,
      action: 'CUSTOMER_LOOKUP',
      target_user_id: req.params.id
    });
    res.json({
      success: true,
      customer: {
        id: detail.user.id,
        username: detail.user.username,
        phone: detail.user.phone,
        account_status: detail.user.account_status,
        created_at: detail.user.created_at,
        balance: detail.user.balance,
        reserved_balance: detail.user.reserved_balance,
        stats: detail.stats
      },
      ...detail
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/staff/my-activity', requireStaff, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const logs = databaseService.getAgentActivityLogs({ actor_id: actorId, limit: 100 });
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Super Admin Dedicated Governance Endpoints (requireSuperAdmin) ----------------

app.get('/api/super-admin/overview', requireSuperAdmin, (req, res) => {
  try {
    const stats = databaseService.getSuperAdminOverviewStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/agents', requireSuperAdmin, (req, res) => {
  try {
    const agents = databaseService.getAgentPerformance();
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/super-admin/agents', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const agent = authService.createAgent(actorId, req.body);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/super-admin/agents/:id', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const updated = authService.updateAgent(actorId, req.params.id, req.body);
    res.json({ success: true, agent: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/super-admin/agents/:id', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const result = authService.deleteAgent(actorId, req.params.id, req.body?.reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/super-admin/agents/:id/restore', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const agent = authService.restoreAgent(actorId, req.params.id);
    res.json({ success: true, agent, message: `Agent ${agent.username} restored to ACTIVE status.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/super-admin/agents/:id/transactions', requireSuperAdmin, (req: any, res) => {
  try {
    const tx = databaseService.getAgentTransactions(req.params.id);
    res.json({ success: true, ...tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/agents/:id/activity', requireSuperAdmin, (req: any, res) => {
  try {
    const logs = databaseService.getAgentActivityLogs({ actor_id: req.params.id, limit: 100 });
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/super-admin/agents/:id/reset-password', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const newPass = req.body.newPassword || req.body.new_password || req.body.password;
    const result = authService.resetAgentPassword(actorId, req.params.id, newPass);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/super-admin/agents/:id/performance', requireSuperAdmin, (req, res) => {
  try {
    const performances = databaseService.getAgentPerformance(req.params.id);
    const performance = performances[0] || null;
    res.json({ success: true, performance, performances });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/payment-accounts', requireSuperAdmin, (req, res) => {
  try {
    const accounts = databaseService.getAllPaymentAccounts();
    res.json({ success: true, accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/super-admin/payment-accounts', requireSuperAdmin, (req: any, res) => {
  try {
    const account = databaseService.createPaymentAccount(req.body);
    databaseService.logAgentActivity({
      actor_id: req.user.playerId || req.user.id,
      actor_role: req.user.role,
      action: 'PAYMENT_ACCOUNT_CREATED',
      target_id: account.id,
      metadata: { phone_number: account.phone_number, account_name: account.account_name }
    });
    const activeAccount = databaseService.getActivePaymentAccount();
    io.emit('payment:active', activeAccount);
    io.to('super_admin_room').emit('payment:updated', { account, activeAccount });
    res.json({ success: true, account });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/super-admin/payment-accounts/:id', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const updated = databaseService.updatePaymentAccount(req.params.id, req.body, actorId, req.body.reason);
    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'PAYMENT_ACCOUNT_UPDATED',
      target_id: req.params.id,
      metadata: { changes: req.body }
    });
    const activeAccount = databaseService.getActivePaymentAccount();
    io.emit('payment:active', activeAccount);
    io.to('super_admin_room').emit('payment:updated', { account: updated, activeAccount });
    res.json({ success: true, account: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/super-admin/payment-accounts/:id/activate', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const account = databaseService.setActivePaymentAccount(req.params.id, actorId, req.body.reason || req.body.note);
    io.emit('payment:active', account);
    io.to('super_admin_room').emit('payment:updated', { account, activeAccount: account });
    res.json({ success: true, account });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/super-admin/payment-accounts/:id/deactivate', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const account = databaseService.deactivatePaymentAccount(req.params.id, actorId, req.body.reason);
    const activeAccount = databaseService.getActivePaymentAccount();
    io.emit('payment:active', activeAccount);
    io.to('super_admin_room').emit('payment:updated', { account, activeAccount });
    res.json({ success: true, account });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/super-admin/payment-accounts/:id', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const result = databaseService.deletePaymentAccount(req.params.id, actorId, req.body?.reason);
    const activeAccount = databaseService.getActivePaymentAccount();
    io.emit('payment:active', activeAccount);
    io.to('super_admin_room').emit('payment:updated', { activeAccount, ...result });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/super-admin/payment-accounts/logs', requireSuperAdmin, (req, res) => {
  try {
    const logs = databaseService.getPaymentAccountLogs();
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/reconciliation', requireSuperAdmin, (req, res) => {
  try {
    const report = databaseService.getReconciliationReport(req.query);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/jackpot/config', requireSuperAdmin, (req, res) => {
  try {
    const config = databaseService.getWeekendJackpotConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/super-admin/jackpot/config', requireSuperAdmin, (req: any, res) => {
  try {
    const updated = databaseService.updateWeekendJackpotConfig(req.body);
    databaseService.logAgentActivity({
      actor_id: req.user.playerId || req.user.id,
      actor_role: req.user.role,
      action: 'JACKPOT_CONFIG_UPDATED',
      metadata: { changes: req.body }
    });
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/super-admin/jackpot/rounds', requireSuperAdmin, (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const history = databaseService.getWeekendJackpotHistory(limit);
    const current = dailyJackpotService.getOrCreateCurrentRound();
    res.json({ success: true, currentRound: current, history, rounds: history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/jackpot/rounds/:roundId/players', requireSuperAdmin, (req, res) => {
  try {
    const players = databaseService.getWeekendJackpotPlayers(req.params.roundId);
    res.json({ success: true, roundId: req.params.roundId, players, count: players.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/audit-logs', requireSuperAdmin, (req, res) => {
  try {
    const logs = databaseService.getAgentActivityLogs(req.query);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/users', requireSuperAdmin, (req, res) => {
  try {
    const search = (req.query.search || req.query.query) as string;
    const rawUsers = authService.getAllUsers(search);
    const users = rawUsers.map((u) => {
      const stats = databaseService.getUserFinancialStats(u.id);
      return {
        ...u,
        ...stats
      };
    });
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/super-admin/users/:id/details', requireSuperAdmin, (req, res) => {
  try {
    const details = databaseService.getUserDetailedProfile(req.params.id);
    if (!details) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, details });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/super-admin/users/:id/status', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const updated = authService.updateUserStatus(actorId, req.params.id, status, reason);
    io.to(`user_${req.params.id}`).emit('USER_STATUS_CHANGED', { status, reason });
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/super-admin/users/:id', requireSuperAdmin, (req: any, res) => {
  try {
    const actorId = req.user.playerId || req.user.id;
    const { reason } = req.body || {};
    const result = authService.deleteUser(actorId, req.params.id, reason);
    io.to(`user_${req.params.id}`).emit('FORCE_DISCONNECT', { reason: 'Account deleted or archived' });
    res.json({ ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/super-admin/balance-adjustment', requireSuperAdmin, async (req: any, res) => {
  const { targetPlayerId, amount, reason } = req.body;
  if (!targetPlayerId || typeof amount !== 'number' || !reason) {
    return res.status(400).json({ error: 'targetPlayerId, numeric amount, and reason are required' });
  }
  try {
    const actorId = req.user.playerId || req.user.id;
    const result = await ledgerService.manualBalanceAdjustment(actorId, targetPlayerId, amount, reason);
    const wallet = databaseService.getOrCreateWallet(targetPlayerId);

    databaseService.logAgentActivity({
      actor_id: actorId,
      actor_role: req.user.role,
      action: 'SUPER_ADMIN_BALANCE_ADJUSTMENT',
      target_user_id: targetPlayerId,
      metadata: { amount, reason }
    });

    io.to(`user_${targetPlayerId}`).emit('WALLET_UPDATED', {
      playerId: targetPlayerId,
      balance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      type: 'ADMIN_ADJUSTMENT',
      amount,
      message: `Balance adjusted by platform admin: ${amount > 0 ? '+' : ''}${amount} ETB (${reason})`
    });

    res.json({ success: true, ...result, newBalance: result.user.walletBalance, wallet });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- WebSocket Gateway with Strict Session Authorization ----------------

// Authenticate socket handshake using session token
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization?.startsWith('Bearer ')
      ? socket.handshake.headers.authorization.substring(7)
      : null) ||
    (process.env.NODE_ENV !== 'production' ? socket.handshake.query?.token : null);

  if (token) {
    const user = authService.getUserByToken(String(token));
    if (user) {
      socket.data.user = user;
      socket.data.sessionToken = String(token);
      return next();
    }
  }

  // Allow anonymous socket connection for lobby preview / guest spectating,
  // but strictly block any balance-affecting actions
  socket.data.user = null;
  socket.data.sessionToken = null;
  next();
});

io.on('connection', (socket) => {
  // Join authenticated private user room for real-time push events (e.g. WALLET_UPDATED)
  if (socket.data.user) {
    if (socket.data.user.id) socket.join(`user_${socket.data.user.id}`);
    if (socket.data.user.playerId) socket.join(`user_${socket.data.user.playerId}`);
    if (socket.data.user.role === 'AGENT') {
      socket.join('staff_room');
      socket.join(`agent_${socket.data.user.id}`);
    } else if (socket.data.user.role === 'SUPER_ADMIN' || socket.data.user.role === 'ADMIN') {
      socket.join('staff_room');
      socket.join('super_admin_room');
    }
  }

  // Allow client to authenticate or re-sync dynamically after connecting
  socket.on('AUTHENTICATE_SOCKET', (data: { token?: string }, callback?: (res: any) => void) => {
    if (data?.token) {
      const user = authService.getUserByToken(data.token);
      if (user) {
        socket.data.user = user;
        socket.data.sessionToken = data.token;
        if (user.id) socket.join(`user_${user.id}`);
        if (user.playerId) socket.join(`user_${user.playerId}`);
        if (user.role === 'AGENT') {
          socket.join('staff_room');
          socket.join(`agent_${user.id}`);
        } else if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
          socket.join('staff_room');
          socket.join('super_admin_room');
        }
        socket.emit('AUTHENTICATED', { success: true, role: user.role, playerId: user.playerId || user.id });
        if (typeof callback === 'function') {
          callback({ success: true, role: user.role, playerId: user.playerId || user.id });
        }
        return;
      }
    }
    socket.emit('AUTHENTICATED', { success: false, error: 'Invalid or expired session token' });
    if (typeof callback === 'function') {
      callback({ success: false, error: 'Invalid or expired session token' });
    }
  });

  // Client explicit de-authentication (e.g. on user logout)
  socket.on('DEAUTHENTICATE_SOCKET', (callback?: (res: any) => void) => {
    if (socket.data.user) {
      const u = socket.data.user;
      if (u.id) socket.leave(`user_${u.id}`);
      if (u.playerId) socket.leave(`user_${u.playerId}`);
      socket.leave('staff_room');
      socket.leave('super_admin_room');
      if (u.id) socket.leave(`agent_${u.id}`);
      socket.data.user = null;
      socket.data.sessionToken = null;
    }
    socket.emit('DEAUTHENTICATED', { success: true });
    if (typeof callback === 'function') callback({ success: true });
  });

  // Resync room state for active players reconnecting after momentary disconnects
  socket.on('RESYNC_ROOM_STATE', (data: { roomId: string }, callback?: (res: any) => void) => {
    const { roomId } = data || {};
    const room = multiRoomManager.getRoom(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }
    const state = room.getPublicState();
    let myTickets: any[] = [];
    if (socket.data.user) {
      const pId = socket.data.user.playerId || socket.data.user.id;
      myTickets = state.tickets.filter((t: any) => t.playerId === pId);
    }
    socket.emit('ROOM_STATE_UPDATE', state);
    if (typeof callback === 'function') {
      callback({ success: true, state, myTickets });
    }
  });

  // Disconnect logging & tracking
  socket.on('disconnect', (reason) => {
    if (socket.data.user && process.env.NODE_ENV !== 'test') {
      const pId = socket.data.user.playerId || socket.data.user.id;
      console.log(`[Socket] User ${pId} disconnected (${reason})`);
    }
  });

  socket.emit('LOBBY_OVERVIEW', multiRoomManager.getLobbySummaries());

  // Subscribe to private registration verification events
  socket.on('SUBSCRIBE_REGISTRATION', (data: { phone?: string }) => {
    if (data?.phone) {
      const normalized = authService.normalizePhone(data.phone);
      socket.join(`reg_${normalized}`);
    }
  });

  socket.on('UNSUBSCRIBE_REGISTRATION', (data: { phone?: string }) => {
    if (data?.phone) {
      const normalized = authService.normalizePhone(data.phone);
      socket.leave(`reg_${normalized}`);
    }
  });

  // Subscribe to private password reset verification events
  socket.on('SUBSCRIBE_PASSWORD_RESET', (data: { phone?: string }) => {
    if (data?.phone) {
      const normalized = authService.normalizePhone(data.phone);
      socket.join(`reset_${normalized}`);
    }
  });

  socket.on('UNSUBSCRIBE_PASSWORD_RESET', (data: { phone?: string }) => {
    if (data?.phone) {
      const normalized = authService.normalizePhone(data.phone);
      socket.leave(`reset_${normalized}`);
    }
  });

  // Join a specific game room
  socket.on('JOIN_ROOM', (data: { roomId: string }, callback) => {
    const { roomId } = data;
    const room = multiRoomManager.getRoom(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    for (const r of socket.rooms) {
      if (r !== socket.id && !r.startsWith('user_') && !r.startsWith('reg_') && !r.startsWith('reset_')) {
        socket.leave(r);
      }
    }

    socket.join(`room_${roomId}`);
    const state = room.getPublicState();
    socket.emit('ROOM_STATE_UPDATE', state);

    if (typeof callback === 'function') {
      callback({ success: true, state });
    }
  });

  socket.on('LEAVE_ROOM', (data: { roomId: string }) => {
    socket.leave(`room_${data.roomId}`);
  });

  // Select specific card number (e.g. Card #22)
  socket.on('SELECT_CARD_NUMBER', async (data: { roomId: string; cardNumber: number; playerId?: string; username?: string }, callback) => {
    try {
      const user = socket.data.user;
      if (!user) {
        if (typeof callback === 'function') callback({ success: false, error: 'Authentication required. Please log in.' });
        return;
      }

      const { roomId, cardNumber } = data;
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      // STRICT USER ISOLATION: Derive identity solely from authenticated socket session!
      const ticket = await room.selectCardNumber(user.playerId, user.username, cardNumber);
      const updatedUser = ledgerService.getUser(user.playerId);
      if (typeof callback === 'function') {
        callback({ success: true, ticket, user: updatedUser });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Lock multiple selected cards in a batch
  socket.on('LOCK_MULTIPLE_CARDS', async (data: { roomId: string; cardNumbers: number[]; playerId?: string; username?: string }, callback) => {
    try {
      const user = socket.data.user;
      if (!user) {
        if (typeof callback === 'function') callback({ success: false, error: 'Authentication required. Please log in.' });
        return;
      }

      const { roomId, cardNumbers } = data;
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      // STRICT USER ISOLATION: Derive identity solely from authenticated socket session!
      const tickets = await room.lockMultipleCards(user.playerId, user.username, cardNumbers);
      const updatedUser = ledgerService.getUser(user.playerId);
      if (typeof callback === 'function') {
        callback({ success: true, tickets, user: updatedUser });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Deselect card number (undo pick)
  socket.on('DESELECT_CARD_NUMBER', async (data: { roomId: string; cardNumber: number; playerId?: string }, callback) => {
    try {
      const user = socket.data.user;
      if (!user) {
        if (typeof callback === 'function') callback({ success: false, error: 'Authentication required. Please log in.' });
        return;
      }

      const { roomId, cardNumber } = data;
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      // STRICT USER ISOLATION: User can only deselect their own cards
      await room.deselectCardNumber(user.playerId, cardNumber);
      const updatedUser = ledgerService.getUser(user.playerId);
      if (typeof callback === 'function') {
        callback({ success: true, user: updatedUser });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Random pick cards (e.g. 1, 2, or 4 random cards)
  socket.on('RANDOM_SELECT_CARDS', async (data: { roomId: string; count: number; playerId?: string; username?: string }, callback) => {
    try {
      const user = socket.data.user;
      if (!user) {
        if (typeof callback === 'function') callback({ success: false, error: 'Authentication required. Please log in.' });
        return;
      }

      const { roomId, count = 1 } = data;
      // DoS Protection: Ensure count is bounded to a safe positive integer (max 20 cards)
      const safeCount = Math.min(Math.max(1, Math.floor(Number(count) || 1)), 20);
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const tickets = [];
      for (let i = 0; i < safeCount; i++) {
        const ticket = await room.pickRandomCardForUser(user.playerId, user.username);
        tickets.push(ticket);
      }
      const updatedUser = ledgerService.getUser(user.playerId);
      if (typeof callback === 'function') {
        callback({ success: true, tickets, user: updatedUser });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Claim BINGO inside a specific room
  socket.on('CLAIM_BINGO', async (data: { roomId: string; ticketId: string; playerId?: string }, callback) => {
    try {
      const user = socket.data.user;
      if (!user) {
        if (typeof callback === 'function') callback({ success: false, message: 'Authentication required. Please log in.' });
        return;
      }

      const { roomId, ticketId } = data;
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, message: 'Room not found' });
        return;
      }

      // STRICT USER ISOLATION: User can only claim with their own authenticated session
      const result = await room.handleClaimBingo(user.playerId, ticketId);
      if (typeof callback === 'function') {
        const updatedUser = ledgerService.getUser(user.playerId);
        callback({ ...result, user: updatedUser });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, message: err.message });
      }
    }
  });
});

// Test diagnostics error endpoint in development/testing
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test-error-handling', (_req, _res, next) => {
    const err: any = new Error('Test controlled server error');
    err.statusCode = 418;
    next(err);
  });
}

// Serve static frontend assets in production if dist exists
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ---------------- Global Express Error Handling Middleware ----------------
app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err.statusCode === 'number' ? err.statusCode : typeof err.status === 'number' ? err.status : 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd && status === 500 ? 'Internal server error' : (err.message || 'Internal server error');
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[UnhandledError] ${req.method} ${req.path}:`, err);
  }
  res.status(status).json({
    error: message,
    status
  });
});

// ---------------- Process Lifecycle & Graceful Shutdown ----------------
const gracefulShutdown = (signal: string) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[Server] Received ${signal}. Gracefully terminating server...`);
  }
  httpServer.close(() => {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[Server] HTTP and Socket server closed.');
    }
    try {
      databaseService.getDb().close();
      if (process.env.NODE_ENV !== 'test') {
        console.log('[Server] Database connections closed cleanly.');
      }
    } catch (dbErr) {
      console.error('[Server] Error closing database:', dbErr);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
};

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export { app, httpServer, multiRoomManager, gracefulShutdown };

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`🎰 Bingo Multi-Room Server running at http://localhost:${PORT}`);
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL;
      const cleanUrl = webAppUrl ? webAppUrl.replace(/\/+$/, '') : '';
      if (cleanUrl) {
        console.log(`[TelegramBot] Configuring menu button for: ${cleanUrl}`);
        telegramBotService.setMenuButton(cleanUrl);
      }
      // Always delete any stale webhook and start polling for 100% reliable local/tunnel dev
      telegramBotService.deleteWebhook().then(() => {
        telegramBotService.startPolling();
      }).catch(err => {
        console.error('[TelegramBot] Failed to reset webhook and start polling:', err);
      });
    }
  });
}

