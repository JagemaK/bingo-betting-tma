import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { LobbyView } from '../src/components/LobbyView.js';
import { TopHeader } from '../src/components/TopHeader.js';
import { DailyJackpotEntryView } from '../src/components/DailyJackpotEntryView.js';
import { DailyJackpotPublicState, UserAccount, RoomSummary, DailyJackpotTicket } from '../src/types/bingo.js';

describe('Daily Grand Jackpot Compact UI & Floating Top Header Suite', () => {
  const mockUser: UserAccount = {
    playerId: 'user-1',
    username: 'Melaku',
    walletBalance: 1490,
    role: 'USER',
    phone: '0911223344',
    isVerified: true,
  };

  const mockRooms: RoomSummary[] = [
    {
      roomId: 'room-1',
      roomName: 'Addis Ababa Gold',
      betPerCard: 20,
      etbEquivalent: 20,
      status: 'lobby',
      lobbyTimeRemaining: 15,
      lobbyDuration: 30,
      isCountdownActive: true,
      activePlayersCount: 15,
      totalCardsSold: 25,
      totalCatalogCards: 100,
      minCardsToStart: 5,
      totalPot: 5000,
      winnerPayoutAmount: 4000,
      playerPayoutPool: 4000,
      isFivePlayerBonus: false,
      gameId: 'game-1',
    }
  ];

  it('renders compact floating top controls with [B] BINGO BET, Shield, Wallet, and Profile', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(TopHeader, {
        mode: 'lobby',
        user: mockUser,
        onOpenWallet: () => {},
        onOpenProvablyFair: () => {},
        onOpenProfile: () => {},
      })
    );

    // Header container should be sticky floating bar with safe-area support
    expect(html).toContain('sticky top-0');
    expect(html).toContain('env(safe-area-inset-top)');
    
    // Left: B logo + BINGO BET branding
    expect(html).toContain('BINGO');
    expect(html).toContain('BET');

    // Right: Security Shield button (Provably Fair) must NOT be in customer header
    expect(html).not.toContain('Provably Fair Security Verification');

    // Right: Wallet pill with ETB balance
    expect(html).toContain('ETB');
    expect(html).toContain('1,490');

    // Right: User profile avatar showing initial 'M' for Melaku
    expect(html).toContain('M');
  });

  it('renders large wallet numbers cleanly in TopHeader without breaking', () => {
    const richUser: UserAccount = { ...mockUser, walletBalance: 2589400.50 };
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(TopHeader, {
        mode: 'lobby',
        user: richUser,
        onOpenWallet: () => {},
        onOpenProvablyFair: () => {},
      })
    );

    expect(html).toContain('2,589,400.5');
  });

  it('prominently displays 150,000 BIRR and NEVER 100,000 BIRR in Daily Grand Jackpot island', () => {
    const jackpotState: DailyJackpotPublicState = {
      roundId: 'round-1',
      date: '2026-09-17',
      status: 'POSTPONED',
      cardsSold: 0,
      maxCards: 200,
      minCards: 100,
      cardPrice: 999,
      jackpotAmount: 100000, // Backend base is 100,000
      cutoffTime: '2026-09-18T09:00:00.000Z',
      serverTime: '2026-09-17T12:00:00.000Z',
      isPostponed: true,
      postponementMessage: 'Not enough cards sold',
      myTickets: [],
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LobbyView, {
        rooms: mockRooms,
        user: mockUser,
        dailyJackpotState: jackpotState,
        onJoinRoom: () => {},
        onOpenWallet: () => {},
        onOpenLeaderboard: () => {},
        onOpenReferral: () => {},
        onOpenContact: () => {},
        onOpenRules: () => {},
        onRefresh: () => {},
      })
    );

    // Must prominently display 150,000 BIRR
    expect(html).toContain('150,000 BIRR');

    // Must NEVER display 100,000 BIRR in the player-facing hero jackpot
    expect(html).not.toContain('100,000 BIRR');

    // Must contain essential jackpot data
    expect(html).toContain('DAILY GRAND JACKPOT');
    expect(html).toContain('OFFICIAL 12:00 PM DRAW');
    expect(html).toContain('POSTPONED · NEXT DRAW 12:00 PM');
    expect(html).toContain('0 / 200');
    expect(html).toContain('Min to Draw: 100');
    expect(html).toContain('999 Birr / Card');
    expect(html).toContain('Max: 200');
    expect(html).toContain('Next Draw:');
    expect(html).toContain('Daily 12:00 PM');
    expect(html).toContain('ENTER JACKPOT →');
  });

  it('completely excludes DAILY STREAK BONUS from the home screen layout', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LobbyView, {
        rooms: mockRooms,
        user: mockUser,
        onJoinRoom: () => {},
        onOpenWallet: () => {},
        onOpenLeaderboard: () => {},
        onOpenReferral: () => {},
        onOpenContact: () => {},
        onOpenRules: () => {},
        onRefresh: () => {},
      })
    );

    // DAILY STREAK BONUS must be absent
    expect(html).not.toContain('DAILY STREAK BONUS');
    expect(html).not.toContain('DAY 3/7');

    // GAME ROOMS must follow directly
    expect(html).toContain('GAME ROOMS');
  });

  it('correctly handles all jackpot status states without collision', () => {
    const statuses: Array<DailyJackpotPublicState['status']> = [
      'REGISTRATION_OPEN',
      'REGISTRATION_CLOSED',
      'GAME_RUNNING',
      'WINNER_FOUND',
      'COMPLETED',
      'POSTPONED',
    ];

    const mockTicket: DailyJackpotTicket = {
      id: 'ticket-1',
      round_id: 'round-test',
      card_number: 42,
      user_id: 'user-1',
      username: 'Melaku',
      price: 999,
      grid_json: '{}',
      fingerprint_hash: 'hash',
      purchased_at: new Date().toISOString(),
    };

    for (const st of statuses) {
      const state: DailyJackpotPublicState = {
        roundId: 'round-test',
        date: '2026-09-17',
        status: st,
        cardsSold: 120,
        maxCards: 200,
        minCards: 100,
        cardPrice: 999,
        jackpotAmount: 160000,
        cutoffTime: '2026-09-18T09:00:00.000Z',
        serverTime: '2026-09-17T12:00:00.000Z',
        isPostponed: st === 'POSTPONED',
        postponementMessage: st === 'POSTPONED' ? 'Postponed' : null,
        myTickets: [mockTicket],
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(LobbyView, {
          rooms: mockRooms,
          user: mockUser,
          dailyJackpotState: state,
          onJoinRoom: () => {},
          onOpenWallet: () => {},
          onOpenLeaderboard: () => {},
          onOpenReferral: () => {},
          onOpenContact: () => {},
          onOpenRules: () => {},
          onRefresh: () => {},
        })
      );

      // Verify higher amount is formatted
      expect(html).toContain('160,000 BIRR');
      expect(html).toContain("YOU&#x27;RE IN — 1 CARD");
      expect(html).toContain('120 / 200');

      if (st === 'REGISTRATION_OPEN') expect(html).toContain('REGISTRATION OPEN');
      if (st === 'REGISTRATION_CLOSED') expect(html).toContain('REGISTRATION CLOSED');
      if (st === 'GAME_RUNNING') expect(html).toContain('GAME RUNNING');
      if (st === 'WINNER_FOUND') expect(html).toContain('WINNER ANNOUNCED');
      if (st === 'COMPLETED') expect(html).toContain('ROUND COMPLETED');
      if (st === 'POSTPONED') expect(html).toContain('POSTPONED · NEXT DRAW 12:00 PM');
    }
  });

  it('renders threshold progression at 0/200, 100/200, and 200/200 cards', () => {
    const cardCounts = [0, 100, 200];
    for (const count of cardCounts) {
      const state: DailyJackpotPublicState = {
        roundId: 'round-cards',
        date: '2026-09-17',
        status: 'REGISTRATION_OPEN',
        cardsSold: count,
        maxCards: 200,
        minCards: 100,
        cardPrice: 999,
        jackpotAmount: 150000,
        cutoffTime: '2026-09-18T09:00:00.000Z',
        serverTime: '2026-09-17T12:00:00.000Z',
        isPostponed: false,
        postponementMessage: null,
        myTickets: [],
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(LobbyView, {
          rooms: mockRooms,
          user: mockUser,
          dailyJackpotState: state,
          onJoinRoom: () => {},
          onOpenWallet: () => {},
          onOpenLeaderboard: () => {},
          onOpenReferral: () => {},
          onOpenContact: () => {},
          onOpenRules: () => {},
          onRefresh: () => {},
        })
      );

      expect(html).toContain(`${count} / 200`);
    }
  });

  it('TopHeader renders [ADMIN] control on all viewports for admin users, and security shield for normal users', () => {
    const adminUser: UserAccount = {
      ...mockUser,
      role: 'ADMIN',
      username: 'AdminBoss',
    };

    // 1. Admin User
    const adminHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(TopHeader, {
        mode: 'lobby',
        user: adminUser,
        onOpenWallet: () => {},
        onOpenProvablyFair: () => {},
        onOpenAdmin: () => {},
      })
    );

    // Admin button MUST be rendered and visible (not hidden md:flex)
    expect(adminHtml).toContain('ADMIN');
    expect(adminHtml).toContain('Admin Control Center');
    expect(adminHtml).not.toContain('hidden md:flex items-center gap-1');

    // 2. Normal User
    const normalHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(TopHeader, {
        mode: 'lobby',
        user: mockUser,
        onOpenWallet: () => {},
        onOpenProvablyFair: () => {},
        onOpenAdmin: () => {},
      })
    );

    // Normal user must NOT see ADMIN control
    expect(normalHtml).not.toContain('Admin Control Center');
    expect(normalHtml).not.toContain('>ADMIN<');
    // Normal user must NOT see Provably Fair Security Verification in header
    expect(normalHtml).not.toContain('Provably Fair Security Verification');
  });

  it('backend getCardsCatalogStatus returns authentic 5x5 B-I-N-G-O grids for all 200 cards', async () => {
    const { DailyJackpotService } = await import('./DailyJackpotService.js');
    const { databaseService } = await import('./DatabaseService.js');

    const jackpotService = new DailyJackpotService(databaseService);
    const catalog = jackpotService.getCardsCatalogStatus();

    expect(catalog).toHaveLength(200);
    expect(catalog[0].cardNumber).toBe(1);
    expect(catalog[0].price).toBe(999);
    expect(catalog[0].grid).toBeDefined();

    // Verify 5x5 B-I-N-G-O grid structure
    const grid = catalog[0].grid;
    expect(grid.B).toHaveLength(5);
    expect(grid.I).toHaveLength(5);
    expect(grid.N).toHaveLength(5);
    expect(grid.G).toHaveLength(5);
    expect(grid.O).toHaveLength(5);

    // N column center is free space (0)
    expect(grid.N[2]).toBe(0);

    // B column is within 1..15
    for (const n of grid.B) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(15);
    }
  });

  it('renders dedicated full-screen DailyJackpotEntryView with back button, 150k banner, 5x5 card preview, and action bar', () => {
    const jackpotState: DailyJackpotPublicState = {
      roundId: 'round-entry-test',
      date: '2026-09-17',
      status: 'REGISTRATION_OPEN',
      cardsSold: 45,
      maxCards: 200,
      minCards: 100,
      cardPrice: 999,
      jackpotAmount: 150000,
      cutoffTime: '2026-09-18T09:00:00.000Z',
      serverTime: '2026-09-17T12:00:00.000Z',
      isPostponed: false,
      postponementMessage: null,
      myTickets: [],
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(DailyJackpotEntryView, {
        user: mockUser,
        token: 'mock-token-123',
        dailyJackpotState: jackpotState,
        onBack: () => {},
        onOpenDeposit: () => {},
      })
    );

    // 1. Back button & Title
    expect(html).toContain('BACK');
    expect(html).toContain('DAILY GRAND JACKPOT');
    expect(html).toContain('Cutoff: 12:00 PM Addis Ababa');

    // 2. Guaranteed Payout & Price
    expect(html).toContain('150,000 BIRR');
    expect(html).toContain('999 BIRR / CARD');
    expect(html).toContain('45 / 200');

    // 3. Card Preview with 5x5 B-I-N-G-O matrix
    expect(html).toContain('CARD #1 PREVIEW');
    expect(html).toContain('FREE');

    // 4. Card Catalog (1 — 200)
    expect(html).toContain('CARD CATALOG (1 — 200)');
    expect(html).toContain('ALL (0)');
    expect(html).toContain('AVAILABLE');
    expect(html).toContain('SELECTED');

    // 5. Sticky Bottom Action Bar
    expect(html).toContain('TOTAL INVESTMENT');
    expect(html).toContain('WALLET BALANCE');
    expect(html).toContain('1,490 BIRR');
    expect(html).toContain('SELECT A CARD TO ENTER');
  });
});
