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

export const calculateWeekendJackpot = calculateDailyGrandJackpot;

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
 * Returns ISO string for Addis Ababa time (UTC+3) on given YYYY-MM-DD
 */
export function getAddisAbabaCutoff(dateStr: string, timeStr = '12:00:00'): string {
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return `${dateStr}T${normalizedTime}+03:00`;
}

/**
 * Returns day of week (0=Sunday, 1=Monday, ..., 6=Saturday) in Africa/Addis_Ababa
 */
export function getAddisAbabaWeekday(date: Date = new Date()): number {
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    weekday: 'short'
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? 0;
}

/**
 * Returns target Sunday date and cutoff ISO string for Weekend Jackpot
 */
export function getNextAddisAbabaSunday(refDate: Date = new Date(), startTime: string = '10:00'): { dateStr: string; cutoffAt: string } {
  const parts = getAddisAbabaTimeParts(refDate);
  const weekday = getAddisAbabaWeekday(refDate);

  const [startHourStr, startMinStr] = (startTime || '10:00').split(':');
  const startHour = parseInt(startHourStr || '10', 10);
  const startMin = parseInt(startMinStr || '0', 10);

  let daysToAdd = 0;
  if (weekday === 0) {
    if (parts.hour < startHour || (parts.hour === startHour && parts.minute < startMin)) {
      daysToAdd = 0;
    } else {
      daysToAdd = 7;
    }
  } else {
    daysToAdd = 7 - weekday;
  }

  const targetDate = new Date(refDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const dateStr = getAddisAbabaDateString(targetDate);
  const normalizedTime = startTime.length === 5 ? `${startTime}:00` : (startTime.length === 8 ? startTime : `${startTime}:00`);
  const cutoffAt = `${dateStr}T${normalizedTime}+03:00`;
  return { dateStr, cutoffAt };
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
    if (process.env.NODE_ENV === 'production' && !process.env.JACKPOT_SERVER_SECRET) {
      throw new Error('FATAL: JACKPOT_SERVER_SECRET environment variable is mandatory in production');
    }
    this.secretSeed = process.env.JACKPOT_SERVER_SECRET || 'bingo_daily_jackpot_secret_dev_test';
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
   * Get or create current active/open round for Addis Ababa Weekend Jackpot
   */
  public getOrCreateCurrentRound(): DailyJackpotRoundRow {
    const config = this.db.getWeekendJackpotConfig();
    const { dateStr, cutoffAt } = getNextAddisAbabaSunday(new Date(), config.start_time || '10:00');

    // First check target Sunday's round
    let round = this.db.getDailyJackpotRoundByDate(dateStr);
    if (!round) {
      // Check if there is an active postponed/rolled-over round that hasn't finished
      const recentRounds = this.db.getAllDailyJackpotRounds(5);
      const activeRolledOver = recentRounds.find(r => r.status === 'POSTPONED' || r.status === 'JACKPOT_READY' || (r.status === 'REGISTRATION_OPEN' && r.date_str !== dateStr));
      if (activeRolledOver) {
        if (activeRolledOver.cards_sold >= (config.min_cards || 100) && activeRolledOver.status === 'POSTPONED') {
          round = this.db.updateDailyJackpotRound(activeRolledOver.id, {
            status: 'JACKPOT_READY',
            postponement_reason: null
          });
          return round;
        }
        return activeRolledOver;
      }
      round = this.db.getOrCreateDailyJackpotRound(dateStr, cutoffAt);
    } else if (round.status === 'POSTPONED' && round.cards_sold >= (config.min_cards || 100)) {
      round = this.db.updateDailyJackpotRound(round.id, {
        status: 'JACKPOT_READY',
        postponement_reason: null
      });
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
    const config = this.db.getWeekendJackpotConfig();
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

    const minCards = config.min_cards || 100;
    return {
      roundId: round.id,
      date: round.date_str,
      status: round.status,
      cardsSold: round.cards_sold,
      maxCards: config.max_cards || 200,
      minCards,
      cardPrice: config.card_price || 999,
      jackpotAmount: round.status === 'COMPLETED' ? round.jackpot_amount : (calc.isEligible ? calc.jackpotAmount : 100000),
      cutoffTime: round.cutoff_at,
      serverTime,
      isPostponed: round.status === 'POSTPONED' && round.cards_sold < minCards,
      postponementMessage: (round.status === 'POSTPONED' && round.cards_sold < minCards)
        ? (round.postponement_reason || `Weekend Jackpot postponed: Not enough cards were sold to start the jackpot. Minimum required: ${minCards} cards. Registration remains open for the next Weekend Jackpot on ${config.day_of_week} at ${config.start_time}.`)
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
    grid: any;
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
        price: 999,
        grid: this.getCardGrid(i)
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

    // Check if the purchase pushed a postponed round over the 100-card threshold
    const updatedRound = this.db.getDailyJackpotRound(round.id);
    if (updatedRound) {
      if (updatedRound.cards_sold >= 100 && updatedRound.status === 'POSTPONED') {
        this.db.updateDailyJackpotRound(round.id, {
          status: 'JACKPOT_READY',
          postponement_reason: null
        });
      } else if (updatedRound.status === 'POSTPONED') {
        this.db.updateDailyJackpotRound(round.id, {
          postponement_reason: `Daily Grand Jackpot postponed: Not enough cards were sold to start today's jackpot. Minimum required: 100 cards. Current cards sold: ${updatedRound.cards_sold}/100. Registration remains open for the next Daily Grand Jackpot at 12:00 PM.`
        });
      }
    }

    // Notify sockets
    if (this.io) {
      const refreshed = this.db.getDailyJackpotRound(round.id);
      if (refreshed) {
        this.io.emit('DAILY_JACKPOT_UPDATED', {
          roundId: round.id,
          cardsSold: refreshed.cards_sold,
          maxCards: 200,
          status: refreshed.status
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

    const config = this.db.getWeekendJackpotConfig();
    const minCards = config.min_cards || 100;

    // Check minimum threshold
    if (round.cards_sold < minCards) {
      // POSTPONE
      const reason = `Weekend Jackpot postponed: Not enough cards were sold to start today's jackpot. Minimum required: ${minCards} cards. Current cards sold: ${round.cards_sold}/${minCards}. Registration remains open for the next Weekend Jackpot on ${config.day_of_week} at ${config.start_time}.`;
      
      const nextSunday = getNextAddisAbabaSunday(new Date(Date.now() + 24 * 60 * 60 * 1000), config.start_time);
      const updated = this.db.updateDailyJackpotRound(round.id, {
        status: 'POSTPONED',
        checked_at: now,
        postponement_reason: reason,
        cutoff_at: nextSunday.cutoffAt
      });

      if (this.io) {
        this.io.emit('DAILY_JACKPOT_EVALUATED', {
          roundId: round.id,
          status: 'POSTPONED',
          message: reason,
          cardsSold: round.cards_sold,
          minCards
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
      winningTicket = tickets[crypto.randomInt(0, tickets.length)];
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
      message: `Weekend Jackpot won by @${winningTicket.username} on Card #${winningTicket.card_number}! Payout: ${calc.jackpotAmount.toLocaleString()} ETB.`,
      round: finishedRound,
      winner: winnerData
    };
  }

  /**
   * Idempotently catches up on missed evaluations due to server downtime or restart
   */
  public checkMissedEvaluations(): void {
    try {
      const time = getAddisAbabaTimeParts();
      const weekday = getAddisAbabaWeekday();
      const round = this.getOrCreateCurrentRound();
      if (!round || round.status === 'COMPLETED') return;

      const config = this.db.getWeekendJackpotConfig();
      const [sh, sm] = (config.start_time || '10:00').split(':').map(s => parseInt(s, 10));
      const cutoffMs = Date.parse(round.cutoff_at);
      const isPastCutoff = Date.now() >= cutoffMs;
      const isSunday = weekday === 0;
      const isAfterStartTime = time.hour > sh || (time.hour === sh && time.minute >= sm);

      // If at or past cutoff or Sunday past configured start time
      if ((isPastCutoff || (isSunday && isAfterStartTime)) && (round.status === 'REGISTRATION_OPEN' || round.status === 'JACKPOT_READY' || round.status === 'REGISTRATION_CLOSED' || round.status === 'CHECKING_ELIGIBILITY')) {
        console.log(`[DailyJackpotService] Recovery catch-up: Cutoff reached for round ${round.id} (status=${round.status}, cards_sold=${round.cards_sold}). Evaluating jackpot...`);
        this.evaluateDailyJackpot(round.id);
      }
    } catch (err) {
      console.error('[DailyJackpotService] Error checking missed evaluations:', err);
    }
  }

  /**
   * Background scheduler running in Africa/Addis_Ababa timezone
   */
  public startDailyScheduler() {
    if (this.schedulerInterval) return;

    // Immediately run recovery check on service startup
    this.checkMissedEvaluations();

    this.schedulerInterval = setInterval(() => {
      try {
        const time = getAddisAbabaTimeParts();
        const weekday = getAddisAbabaWeekday();
        const todayDate = getAddisAbabaDateString();
        const config = this.db.getWeekendJackpotConfig();
        const [sh, sm] = (config.start_time || '10:00').split(':').map(s => parseInt(s, 10));

        // Check if Sunday (0) and at/past start time
        const isSunday = weekday === 0;
        const isPastStartTime = time.hour > sh || (time.hour === sh && time.minute >= sm);

        if (isSunday && isPastStartTime) {
          const round = this.getOrCreateCurrentRound();
          if (round && round.status !== 'COMPLETED' && (round.status === 'REGISTRATION_OPEN' || round.status === 'JACKPOT_READY' || round.status === 'REGISTRATION_CLOSED' || round.status === 'CHECKING_ELIGIBILITY')) {
            if (this.lastEvaluatedDate !== todayDate) {
              console.log(`[DailyJackpotService] Weekend Jackpot scheduled time reached for ${todayDate}. Evaluating jackpot round ${round.id}...`);
              this.evaluateDailyJackpot(round.id);
            }
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
