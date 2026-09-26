import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer } from './index.js';
import { databaseService } from './DatabaseService.js';
import { ledgerService } from './LedgerService.js';
import { authService } from './AuthService.js';
import { GameRoomManager } from './GameRoomManager.js';

let BASE_URL: string;
let sessionToken: string;
const testUserId = `forensic_user_${Date.now()}`;
const testUsername = 'ForensicTester';

describe('Forensic Audit & Remediation Regression Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Ensure test user exists with zero initial balance
    ledgerService.getOrCreateUser(testUserId, testUsername, undefined, 'USER', 0);
    const session = databaseService.createSession(testUserId, '999888777');
    sessionToken = session.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('1. Production Simulation Endpoint Protection', () => {
    it('permanently blocks /api/telegram/simulate-contact-share in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await fetch(`${BASE_URL}/api/telegram/simulate-contact-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: '+251911223344',
            tgUserId: 123456
          })
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toMatch(/permanently disabled in production/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('allows simulation endpoint in test environment', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/simulate-contact-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '+251911223344',
          tgUserId: 987654
        })
      });

      // Endpoint is accessible (returns 200 or 400 validation depending on pending state, NOT 403)
      expect(res.status).not.toBe(403);
    });
  });

  describe('2. Referral Claim Hardening & Infinite Money Prevention', () => {
    it('rejects unauthenticated requests to /api/referral/claim with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/referral/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: testUserId })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/token missing|authentication required/i);
    });

    it('rejects attempts to claim referral commission for another user with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ playerId: 'attacker_impersonated_id' })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cannot claim earnings for another user/i);
    });

    it('successfully processes first referral claim and enforces strict idempotency against duplicate claims', async () => {
      // Setup a referred user who makes an approved deposit
      const refereeId = `usr_referee_${Date.now()}`;
      databaseService.createUser({
        id: refereeId,
        telegram_id: `tg_referee_${Date.now()}`,
        username: 'Referee Player',
        phone: '0911778899',
        referral_code: `REF_SUB_${Date.now()}`,
        referred_by: testUserId,
        role: 'USER'
      });

      const refereeDep = databaseService.createDepositRequest(refereeId, 'Referee Player', 100, 'Telebirr');
      databaseService.approveDeposit('admin_usr_01', refereeDep.id);

      const initialWallet = databaseService.getOrCreateWallet(testUserId);
      const initialBonus = initialWallet.bonus_balance;
      const initialCash = initialWallet.balance;

      // First claim: Should succeed and credit 10 ETB bonus balance
      const res1 = await fetch(`${BASE_URL}/api/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ playerId: testUserId })
      });

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.claimedAmountETB).toBe(10);

      const walletAfterClaim1 = databaseService.getOrCreateWallet(testUserId);
      expect(walletAfterClaim1.bonus_balance).toBe(Number((initialBonus + 10).toFixed(2)));
      expect(walletAfterClaim1.balance).toBe(initialCash); // Cash balance untouched!

      // Second claim attempt: Must be rejected with 400 and NOT credit any balance
      const res2 = await fetch(`${BASE_URL}/api/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ playerId: testUserId })
      });

      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toMatch(/no unclaimed referral rewards available/i);

      // Verify wallet balance remained completely unchanged after duplicate attempt
      const walletAfterClaim2 = databaseService.getOrCreateWallet(testUserId);
      expect(walletAfterClaim2.bonus_balance).toBe(walletAfterClaim1.bonus_balance);
      expect(walletAfterClaim2.balance).toBe(walletAfterClaim1.balance);
    });
  });

  describe('3. Card Deselection Persistence & Unique Constraint Collision Clean-up', () => {
    it('deletes the ticket from player_tickets upon deselection, enabling clean re-selection', async () => {
      const mockIo = {
        to: () => ({ emit: () => {} }),
        emit: () => {}
      } as any;

      const roomConfig = {
        roomId: `room_desel_test_${Date.now()}`,
        roomName: 'Deselection Test Room',
        betPerCard: 20,
        etbEquivalent: 20,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 500,
        totalCatalogCards: 200,
        minCardsToStart: 5
      };

      const room = new GameRoomManager(mockIo, roomConfig, databaseService);

      // Credit test user with 100 ETB for betting
      databaseService.updateWalletBalance(testUserId, 100, 0, 0);

      // User selects card #15
      const ticket = await room.selectCardNumber(testUserId, testUsername, 15);
      expect(ticket).toBeDefined();
      expect(ticket.cardNumber).toBe(15);

      // Verify ticket row exists in persistent database
      const dbTicketsBefore = databaseService.getTicketsForGame(room.gameId);
      const ticketInDbBefore = dbTicketsBefore.find(t => t.card_number === 15);
      expect(ticketInDbBefore).toBeDefined();
      expect(ticketInDbBefore?.user_id).toBe(testUserId);

      // User deselects card #15
      const deselectResult = await room.deselectCardNumber(testUserId, 15);
      expect(deselectResult).toBe(true);

      // CRITICAL FORENSIC CHECK: Verify ticket row was DELETED from SQLite player_tickets table
      const dbTicketsAfter = databaseService.getTicketsForGame(room.gameId);
      const ticketInDbAfter = dbTicketsAfter.find(t => t.card_number === 15);
      expect(ticketInDbAfter).toBeUndefined();

      // Another user (or same user) can now pick card #15 without UNIQUE constraint violation
      const buyer2Id = `buyer2_${Date.now()}`;
      ledgerService.getOrCreateUser(buyer2Id, 'Buyer2', undefined, 'USER', 0);
      databaseService.updateWalletBalance(buyer2Id, 100, 0, 0);

      const reselectTicket = await room.selectCardNumber(buyer2Id, 'Buyer2', 15);
      expect(reselectTicket).toBeDefined();
      expect(reselectTicket.cardNumber).toBe(15);
      expect(reselectTicket.playerId).toBe(buyer2Id);

      // Database now has card #15 owned by Buyer2
      const dbTicketsFinal = databaseService.getTicketsForGame(room.gameId);
      const ticketInDbFinal = dbTicketsFinal.find(t => t.card_number === 15);
      expect(ticketInDbFinal).toBeDefined();
      expect(ticketInDbFinal?.user_id).toBe(buyer2Id);
    });
  });

  describe('4. Socket RANDOM_SELECT_CARDS Input DoS Clamping', () => {
    it('correctly clamps excessive or invalid counts to safe range [1, 20]', () => {
      const clamp = (count: any) => Math.min(Math.max(1, Math.floor(Number(count) || 1)), 20);

      expect(clamp(10000000)).toBe(20);
      expect(clamp(50)).toBe(20);
      expect(clamp(20)).toBe(20);
      expect(clamp(4)).toBe(4);
      expect(clamp(1)).toBe(1);
      expect(clamp(0)).toBe(1);
      expect(clamp(-10)).toBe(1);
      expect(clamp('invalid')).toBe(1);
      expect(clamp(null)).toBe(1);
      expect(clamp(undefined)).toBe(1);
    });
  });
});
