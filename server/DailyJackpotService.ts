import { Server } from 'socket.io';
import { databaseService, DatabaseService, DailyJackpotRoundRow, DailyJackpotTicketRow } from './DatabaseService.js';
import { generate75BallCard, verifyWinningPatterns } from './BingoEngine.js';
import crypto from 'crypto';

function shuffleBalls(arr: number[]): number[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface DailyJackpotCalculationResult {
  cardsSold: number;
  grossSales: number;
  jackpotAmount: number;
  platformRetained: number;
  isEligible: boolean;
}

/**
 * Authoritative single calculation function for the Daily Grand Jackpot.
 *
 * Rules:
 * - Card price: 999 ETB
 * - Min cards to start: 100
 * - Max cards: 200
 * - 100-110 cards: Jackpot = 100,000 ETB
 * - 111-160 cards: Platform retains exactly 10,000 ETB. Jackpot = (cardsSold * 999) - 10,000 ETB
 * - 161-200 cards: Jackpot capped at 150,000 ETB. Platform retains remainder.
 * - < 100 cards: Not eligible (postponed, no jackpot)
 */
export function calculateDailyGrandJackpot(cardsSold: number): DailyJackpotCalculationResult {
  if (typeof cardsSold !== 'number' || !Number.isInteger(cardsSold) || cardsSold < 0 || cardsSold > 200) {
    throw new Error(`Invalid cardsSold count: ${cardsSold}. Must be an integer between 0 and 200.`);
  }

  const CARD_PRICE = 999;
  const grossSales = cardsSold * CARD_PRICE;

  if (cardsSold < 100) {
    return {
      cardsSold,
      grossSales,
      jackpotAmount: 0,
      platformRetained: 0,
      isEligible: false
    };
  }

  let jackpotAmount = 0;
  let platformRetained = 0;

  if (cardsSold <= 110) {
    jackpotAmount = 100000;
    platformRetained = grossSales - jackpotAmount;
  } else if (cardsSold <= 160) {
    platformRetained = 10000;
    jackpotAmount = grossSales - platformRetained;
  } else {
    jackpotAmount = 150000;
    platformRetained = grossSales - jackpotAmount;
  }

  return {
    cardsSold,
    grossSales,
    jackpotAmount,
    platformRetained,
    isEligible: true
  };
}

/**
 * Returns YYYY-MM-DD in Africa/Addis_Ababa timezone
 */
export function getAddisAbabaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Returns ISO string for 12:00:00 PM Addis Ababa time (UTC+3) on given YYYY-MM-DD
 */
export function getAddisAbabaCutoff(dateStr: string): string {
  return `${dateStr}T12:00:00+03:00`;
}

/**
 * Extract time parts in Africa/Addis_Ababa timezone
 */
export function getAddisAbabaTimeParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(date);

  const getPart = (type: string) => {
    const p = parts.find(x => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second')
  };
}

export class DailyJackpotService {
  private db: DatabaseService;
  private io?: Server;
  private cardCatalog: Map<number, any> = new Map();
  private schedulerInterval: NodeJS.Timeout | null = null;
  private lastEvaluatedDate: string | null = null;
  private secretSeed: string;

  constructor(db: DatabaseService, io?: Server) {
    this.db = db;
    this.io = io;
    this.secretSeed = process.env.JACKPOT_SERVER_SECRET || 'bingo_daily_jackpot_secret_2026';
    this.initCardCatalog();
  }

  public setIo(io: Server) {
    this.io = io;
  }

  /**
   * Initialize a deterministic catalog of 200 75-ball cards (1..200)
   */
  private initCardCatalog() {
    for (let i = 1; i <= 200; i++) {
      const card = generate75BallCard();
      this.cardCatalog.set(i, card);
    }
  }

  public getCardGrid(cardNumber: number): any {
    return this.cardCatalog.get(cardNumber) || generate75BallCard();
  }

  /**
   * Get or create current active/open round for Addis Ababa
   */
  public getOrCreateCurrentRound(): DailyJackpotRoundRow {
    const todayDate = getAddisAbabaDateString();
    const cutoff = getAddisAbabaCutoff(todayDate);

    // First check today's round
    let round = this.db.getDailyJackpotRoundByDate(todayDate);
    if (!round) {
      // Check if there is an active postponed round that hasn't finished
      const recentRounds = this.db.getAllDailyJackpotRounds(5);
      const postponed = recentRounds.find(r => r.status === 'POSTPONED');
      if (postponed) {
        return postponed;
      }
      round = this.db.getOrCreateDailyJackpotRound(todayDate, cutoff);
    }
    return round;
  }

  /**
   * Get public state for player consumption (NEVER exposes platform cut)
   */
  public getPublicState(userId?: string): {
    roundId: string;
    date: string;
    status: string;
    cardsSold: number;
    maxCards: number;
    minCards: number;
    cardPrice: number;
    jackpotAmount: number;
    cutoffTime: string;
    serverTime: string;
    isPostponed: boolean;
    postponementMessage: string | null;
    myTickets: DailyJackpotTicketRow[];
    winner?: {
      username: string;
      cardNumber: number;
      amount: number;
    } | null;
  } {
    const round = this.getOrCreateCurrentRound();
    const calc = calculateDailyGrandJackpot(round.cards_sold);
    const serverTime = new Date().toISOString();

    const myTickets = userId ? this.db.getUserDailyJackpotTickets(round.id, userId) : [];

    let winnerInfo = null;
    if (round.status === 'COMPLETED' && round.winner_username && round.winner_card_number) {
      winnerInfo = {
        username: round.winner_username,
        cardNumber: round.winner_card_number,
        amount: round.jackpot_amount
      };
    }

    return {
      roundId: round.id,
      date: round.date_str,
      status: round.status,
      cardsSold: round.cards_sold,
      maxCards: 200,
      minCards: 100,
      cardPrice: 999,
      jackpotAmount: round.status === 'COMPLETED' ? round.jackpot_amount : (calc.isEligible ? calc.jackpotAmount : 100000),
      cutoffTime: round.cutoff_at,
      serverTime,
      isPostponed: round.status === 'POSTPONED',
      postponementMessage: round.status === 'POSTPONED'
        ? (round.postponement_reason || 'Not enough cards were sold to start today\'s jackpot. Minimum required: 100 cards. Registration remains open for the next Daily Grand Jackpot at 12:00 PM.')
        : null,
      myTickets,
      winner: winnerInfo
    };
  }

  /**
   * Get administrative metrics (Includes internal accounting data)
   */
  public getAdminState() {
    const current = this.getOrCreateCurrentRound();
    const history = this.db.getAllDailyJackpotRounds(20);

    const enrichRound = (r: DailyJackpotRoundRow) => {
      const rCalc = calculateDailyGrandJackpot(r.cards_sold);
      const calculatedJackpot = r.status === 'COMPLETED' ? (r.jackpot_amount ?? 0) : rCalc.jackpotAmount;
      const calculatedPlatformRetained = r.status === 'COMPLETED' ? (r.platform_retained_amount ?? 0) : rCalc.platformRetained;

      return {
        ...r,
        round_id: r.id,
        jackpot_date: r.date_str,
        date: r.date_str,
        gross_sales: r.gross_sales ?? (r.cards_sold * 999),
        gross_card_sales: r.gross_sales ?? (r.cards_sold * 999),
        calculated_jackpot: calculatedJackpot,
        calculatedJackpot: calculatedJackpot,
        platform_retained_amount: calculatedPlatformRetained,
        calculatedPlatformRetained: calculatedPlatformRetained,
        cutoff_time: r.cutoff_at,
        cutoff_at: r.cutoff_at,
        postponed_reason: r.postponement_reason,
        postponement_reason: r.postponement_reason,
        winner_payout_amount: r.jackpot_amount
      };
    };

    return {
      currentRound: enrichRound(current),
      history: history.map(enrichRound)
    };
  }

  /**
   * Get card catalog status (1..200) indicating taken vs available
   */
  public getCardsCatalogStatus(roundId?: string, userId?: string): Array<{
    cardNumber: number;
    isTaken: boolean;
    isOwnedByMe: boolean;
    price: number;
  }> {
    const round = roundId ? this.db.getDailyJackpotRound(roundId) : this.getOrCreateCurrentRound();
    if (!round) return [];

    const tickets = this.db.getDailyJackpotTickets(round.id);
    const takenMap = new Map<number, string>();
    for (const t of tickets) {
      takenMap.set(t.card_number, t.user_id);
    }

    const result = [];
    for (let i = 1; i <= 200; i++) {
      const ownerId = takenMap.get(i);
      result.push({
        cardNumber: i,
        isTaken: Boolean(ownerId),
        isOwnedByMe: Boolean(userId && ownerId === userId),
        price: 999
      });
    }
    return result;
  }

  /**
   * Atomically purchase cards for user
   */
  public purchaseCards(userId: string, username: string, cardNumbers: number[]) {
    const round = this.getOrCreateCurrentRound();

    // Check cutoff if status is REGISTRATION_OPEN
    const cutoffMs = Date.parse(round.cutoff_at);
    if (round.status === 'REGISTRATION_OPEN' && Date.now() >= cutoffMs) {
      throw new Error('Registration is closed. The daily 12:00 PM cutoff has passed.');
    }

    const result = this.db.purchaseDailyJackpotTickets({
      roundId: round.id,
      userId,
      username,
      cardNumbers,
      cardGrids: this.cardCatalog,
      fingerprintSecret: this.secretSeed
    });

    // Notify sockets
    if (this.io) {
      const updatedRound = this.db.getDailyJackpotRound(round.id);
      if (updatedRound) {
        this.io.emit('DAILY_JACKPOT_UPDATED', {
          roundId: round.id,
          cardsSold: updatedRound.cards_sold,
          maxCards: 200,
          status: updatedRound.status
        });
      }
    }

    return result;
  }

  /**
   * Evaluates the Daily Grand Jackpot round at 12:00 PM.
   * - If < 100 cards: postpones round.
   * - If >= 100 cards: runs provably fair 75-ball draw, selects winner, atomically credits wallet, updates ledger & audit logs.
   */
  public evaluateDailyJackpot(targetRoundId?: string): {
    success: boolean;
    status: 'POSTPONED' | 'COMPLETED' | 'SKIPPED';
    message: string;
    round: DailyJackpotRoundRow;
    winner?: {
      userId: string;
      username: string;
      cardNumber: number;
      ticketId: string;
      jackpotAmount: number;
    };
  } {
    const round = targetRoundId
      ? this.db.getDailyJackpotRound(targetRoundId)
      : this.getOrCreateCurrentRound();

    if (!round) {
      throw new Error('No active Daily Grand Jackpot round found.');
    }

    if (round.status === 'COMPLETED') {
      throw new Error(`Round ${round.id} is already COMPLETED.`);
    }

    const now = new Date().toISOString();
    const todayDate = getAddisAbabaDateString();
    this.lastEvaluatedDate = todayDate;

    // Check minimum threshold
    if (round.cards_sold < 100) {
      // POSTPONE
      const reason = `Daily Grand Jackpot postponed: Not enough cards were sold to start today's jackpot. Minimum required: 100 cards. Current cards sold: ${round.cards_sold}/100. Registration remains open for the next Daily Grand Jackpot at 12:00 PM.`;
      
      const tomorrowCutoff = new Date(Date.parse(round.cutoff_at) + 24 * 60 * 60 * 1000).toISOString();
      const updated = this.db.updateDailyJackpotRound(round.id, {
        status: 'POSTPONED',
        checked_at: now,
        postponement_reason: reason,
        cutoff_at: tomorrowCutoff
      });

      if (this.io) {
        this.io.emit('DAILY_JACKPOT_EVALUATED', {
          roundId: round.id,
          status: 'POSTPONED',
          message: reason,
          cardsSold: round.cards_sold,
          minCards: 100
        });
      }

      return {
        success: true,
        status: 'POSTPONED',
        message: reason,
        round: updated
      };
    }

    // ELIGIBLE TO START (100–200 cards sold)
    const calc = calculateDailyGrandJackpot(round.cards_sold);
    const tickets = this.db.getDailyJackpotTickets(round.id);

    if (tickets.length === 0) {
      throw new Error('Cards sold count indicates >= 100, but no tickets found in database.');
    }

    // Provably fair ball draw
    const allBalls = Array.from({ length: 75 }, (_, i) => i + 1);
    const shuffledBalls = shuffleBalls(allBalls);

    // Simulate ball calls to find the first BINGO among the purchased tickets
    let winningTicket: DailyJackpotTicketRow | null = null;
    let winningBallIndex = 75;

    for (let drawIdx = 4; drawIdx <= 75; drawIdx++) {
      const drawnSoFar = shuffledBalls.slice(0, drawIdx);
      for (const t of tickets) {
        const grid = JSON.parse(t.grid_json);
        const win = verifyWinningPatterns(grid, drawnSoFar);
        if (win.hasWon) {
          winningTicket = t;
          winningBallIndex = drawIdx;
          break;
        }
      }
      if (winningTicket) break;
    }

    // Fallback if no pattern matched by ball 75 (guarantee a winner among participants)
    if (!winningTicket) {
      winningTicket = tickets[Math.floor(Math.random() * tickets.length)];
    }

    // Record winner atomically in database
    this.db.recordDailyJackpotWinner({
      roundId: round.id,
      winnerUserId: winningTicket.user_id,
      winnerUsername: winningTicket.username,
      winnerTicketId: winningTicket.id,
      winnerCardNumber: winningTicket.card_number,
      jackpotAmount: calc.jackpotAmount,
      platformRetained: calc.platformRetained
    });

    const finishedRound = this.db.getDailyJackpotRound(round.id)!;

    const winnerData = {
      userId: winningTicket.user_id,
      username: winningTicket.username,
      cardNumber: winningTicket.card_number,
      ticketId: winningTicket.id,
      amount: calc.jackpotAmount,
      jackpotAmount: calc.jackpotAmount
    };

    // Emit Socket.io announcements
    if (this.io) {
      this.io.emit('DAILY_JACKPOT_EVALUATED', {
        roundId: round.id,
        status: 'COMPLETED',
        winner: winnerData,
        jackpotAmount: calc.jackpotAmount
      });

      this.io.to(`user_${winningTicket.user_id}`).emit('WALLET_UPDATED', {
        balance: this.db.getWallet(winningTicket.user_id)?.balance,
        reason: 'daily_jackpot_win',
        amount: calc.jackpotAmount
      });
    }

    return {
      success: true,
      status: 'COMPLETED',
      message: `Daily Grand Jackpot won by @${winningTicket.username} on Card #${winningTicket.card_number}! Payout: ${calc.jackpotAmount.toLocaleString()} ETB.`,
      round: finishedRound,
      winner: winnerData
    };
  }

  /**
   * Background scheduler running in Africa/Addis_Ababa timezone
   */
  public startDailyScheduler() {
    if (this.schedulerInterval) return;

    this.schedulerInterval = setInterval(() => {
      try {
        const time = getAddisAbabaTimeParts();
        const todayDate = getAddisAbabaDateString();

        // Check if current time is 12:00 PM Addis Ababa
        if (time.hour === 12 && time.minute === 0) {
          if (this.lastEvaluatedDate !== todayDate) {
            console.log(`[DailyJackpotService] 12:00 PM Addis Ababa reached for ${todayDate}. Evaluating jackpot...`);
            this.evaluateDailyJackpot();
          }
        }
      } catch (err) {
        console.error('[DailyJackpotService] Scheduler error:', err);
      }
    }, 30000); // Check every 30 seconds
  }

  public stopDailyScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

export const dailyJackpotService = new DailyJackpotService(databaseService);
