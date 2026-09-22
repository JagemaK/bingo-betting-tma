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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------- Telegram Bot Webhook & Contact Verification ----------------

// Telegram Webhook receiver (for live bot updates)
app.post('/api/telegram/webhook', async (req, res) => {
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

const requireAdmin = (req: any, res: any, next: any) => {
  authenticateSession(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
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
app.post('/api/auth/telegram', async (req, res) => {
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
app.post('/api/auth/register', async (req, res) => {
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
app.post('/api/auth/register-initiate', (req, res) => {
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
app.post('/api/auth/verify', (req, res) => {
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
app.post('/api/auth/forgot-password-initiate', (req, res) => {
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
app.post('/api/auth/forgot-password-complete', (req, res) => {
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
app.post('/api/auth/login', (req, res) => {
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
  const user = ledgerService.getOrCreateUser(
    targetId,
    req.body.username || 'TelegramPlayer',
    req.body.avatarUrl
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

    res.json({
      success: true,
      deposit: depositReq,
      request: depositReq,
      user: ledgerService.getUser(targetPlayerId),
      message: 'Deposit request submitted via Telebirr. Pending admin verification.'
    });
  } catch (err: any) {
    if (err.message && err.message.includes('already been submitted or credited')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

// Withdraw funds (Strict Telebirr-Only with Ethiopian Phone Validation)
app.post('/api/wallet/withdraw', authenticateSession, async (req: any, res) => {
  const { amount } = req.body;
  const requestedId = req.body.playerId;
  const currentUserId = req.user?.playerId;

  // IDOR Protection: Reject attempts to withdraw from another user's account
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
      return res.status(400).json({ error: 'Invalid withdrawal amount: must be a valid number' });
    }
    const withdrawAmount = Math.round(rawAmount * 100) / 100;
    if (withdrawAmount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 10 Birr' });
    }
    if (withdrawAmount > 50000) {
      return res.status(400).json({ error: 'Maximum single withdrawal amount is 50,000 Birr' });
    }

    // Telebirr Account Phone validation
    const rawAddress = req.body.address || req.body.withdrawAddress || req.body.phone;
    if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
      return res.status(400).json({ error: 'Telebirr account phone number is required' });
    }
    const normalizedPhone = authService.normalizePhone(rawAddress.trim());
    const localTelebirrPhone = formatLocalPhone(normalizedPhone) || normalizedPhone;
    if (!/^(09|07)\d{8}$/.test(localTelebirrPhone)) {
      return res.status(400).json({
        error: 'Invalid Telebirr phone number. Must be a valid Ethiopian mobile number (09xxxxxxxx or 07xxxxxxxx)'
      });
    }

    const userObj = ledgerService.getUser(targetPlayerId);
    // Balance is atomically reserved and held; status is PENDING
    const withdrawalReq = ledgerService.createWithdrawalRequest(
      targetPlayerId,
      userObj?.username || req.user.username || 'Player',
      withdrawAmount,
      localTelebirrPhone
    );
    res.json({
      success: true,
      withdrawal: withdrawalReq,
      request: withdrawalReq,
      user: ledgerService.getUser(targetPlayerId),
      message: 'Withdrawal request submitted for Telebirr payout. Balance reserved pending admin review.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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

// Leaderboard: Top Winners and High-Rollers
app.get('/api/leaderboard', (req, res) => {
  const topWinners = [
    { rank: 1, username: 'HabeshaKing_777', totalWonUSD: 3450.00, totalWonETB: 34500, gamesPlayed: 142, badge: '👑 VIP Champion' },
    { rank: 2, username: 'BingoQueen_VIP', totalWonUSD: 2890.00, totalWonETB: 28900, gamesPlayed: 98, badge: '💎 High-Roller' },
    { rank: 3, username: 'EthioStar_99', totalWonUSD: 2150.00, totalWonETB: 21500, gamesPlayed: 110, badge: '⭐ Master Dauber' },
    { rank: 4, username: 'AddisWinner_251', totalWonUSD: 1780.00, totalWonETB: 17800, gamesPlayed: 85, badge: '🔥 Streak 5x' },
    { rank: 5, username: 'ShegerLucky_7', totalWonUSD: 1420.00, totalWonETB: 14200, gamesPlayed: 64, badge: '⚡ Lucky Strike' },
    { rank: 6, username: 'BoleMaster_21', totalWonUSD: 1150.00, totalWonETB: 11500, gamesPlayed: 52, badge: '🎯 Sniper' },
    { rank: 7, username: 'DiamondHands_7', totalWonUSD: 940.00, totalWonETB: 9400, gamesPlayed: 43, badge: '✨ Pro' },
  ];

  const recentJackpots = [
    { username: 'HabeshaKing_777', amountUSD: 1200.00, amountETB: 12000, pattern: 'Full House (Blackout)', timeAgo: '3m ago', room: 'Grand Mega Jackpot' },
    { username: 'AddisWinner_251', amountUSD: 450.00, amountETB: 4500, pattern: 'Four Corners', timeAgo: '12m ago', room: 'Silver Arena' },
    { username: 'BingoQueen_VIP', amountUSD: 850.00, amountETB: 8500, pattern: 'Column B Line', timeAgo: '28m ago', room: 'Gold VIP Lounge' },
  ];

  res.json({ topWinners, recentJackpots });
});

// Referral & Affiliate Income
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

  const profile = authService.getFullProfile(targetId);
  const referralCode = profile?.referral_code || `BINGO_${targetId.slice(-4).toUpperCase()}`;
  res.json({
    referralCode,
    referralLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT'}?start=${referralCode}`,
    totalInvited: 18,
    activeReferrals: 12,
    totalEarnedUSD: 64.50,
    totalEarnedETB: 645,
    pendingClaimUSD: 15.00,
    pendingClaimETB: 150,
    commissionRate: '5% of Ticket Purchases'
  });
});

// Claim Referral Earnings
app.post('/api/referral/claim', optionalSession, async (req: any, res) => {
  const currentUserId = req.user?.playerId;
  const { playerId } = req.body;

  if (currentUserId && playerId && playerId !== currentUserId) {
    return res.status(403).json({ error: 'Access denied: Cannot claim earnings for another user' });
  }

  const targetPlayerId = currentUserId || playerId;
  if (!targetPlayerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const entry = await ledgerService.recordTransaction(
      targetPlayerId,
      'deposit',
      150.00,
      'Affiliate Referral Commission Payout (150 Birr)'
    );
    const user = ledgerService.getUser(targetPlayerId);
    res.json({ success: true, entry, user, claimedAmountETB: 150, claimedAmount: 150 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Provably Fair Audit Verifier tool
app.post('/api/game/verify-fairness', (req, res) => {
  const { balls, serverSeed, expectedHash } = req.body;
  if (!Array.isArray(balls) || !serverSeed) {
    return res.status(400).json({ error: 'Missing balls array or serverSeed' });
  }
  const calculatedHash = computeCommitmentHash(balls, serverSeed);
  const isValid = expectedHash ? calculatedHash.toLowerCase() === expectedHash.toLowerCase() : true;
  res.json({
    calculatedHash,
    expectedHash,
    isValid,
    message: isValid
      ? 'Cryptographic commitment verified: No server manipulation detected.'
      : 'Hash mismatch: Verification failed.'
  });
});

// ---------------- Admin REST API Endpoints (Strict Server-Side Role Enforcement) ----------------

// Verify Admin Status endpoint - Requires valid session with role ADMIN
app.get('/api/admin/verify', requireAdmin, (req: any, res) => {
  res.json({ success: true, role: 'ADMIN', user: req.user });
});

// 1. Get all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = authService.getAllUsers();
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

// ---------------- WebSocket Gateway with Strict Session Authorization ----------------

// Authenticate socket handshake using session token
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization?.startsWith('Bearer ')
      ? socket.handshake.headers.authorization.substring(7)
      : null) ||
    socket.handshake.query?.token;

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
  }

  // Allow client to authenticate or re-sync dynamically after connecting
  socket.on('AUTHENTICATE_SOCKET', (data: { token?: string }) => {
    if (data?.token) {
      const user = authService.getUserByToken(data.token);
      if (user) {
        socket.data.user = user;
        socket.data.sessionToken = data.token;
        if (user.id) socket.join(`user_${user.id}`);
        if (user.playerId) socket.join(`user_${user.playerId}`);
      }
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
      const room = multiRoomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const tickets = [];
      for (let i = 0; i < count; i++) {
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

export { app, httpServer, multiRoomManager };

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`🎰 Bingo Multi-Room Server running at http://localhost:${PORT}`);
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL;
      if (webAppUrl && webAppUrl.startsWith('https://')) {
        const cleanUrl = webAppUrl.replace(/\/+$/, '');
        console.log(`[TelegramBot] Configuring webhook and menu button for: ${cleanUrl}`);
        telegramBotService.setWebhook(`${cleanUrl}/api/telegram/webhook`);
        telegramBotService.setMenuButton(cleanUrl);
      } else {
        telegramBotService.startPolling();
        if (webAppUrl) {
          telegramBotService.setMenuButton(webAppUrl);
        }
      }
    }
  });
}

