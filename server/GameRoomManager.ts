import crypto from 'crypto';
import { Server } from 'socket.io';
import {
  getCartelaCatalog,
  generateShuffledBalls,
  generateServerSeed,
  computeCommitmentHash,
  computeTicketFingerprint,
  verifyWinningPatterns,
  calculatePariMutuelPool,
  splitPrize,
  getBallLetter,
  BingoGrid,
  WinningPatternResult
} from './BingoEngine.js';
import { ledgerService, UserAccount } from './LedgerService.js';
import { databaseService, DatabaseService } from './DatabaseService.js';

export type GameStatus = 'lobby' | 'active' | 'finished';

/**
 * Game rules (Ethiopian Telegram bingo style):
 * - Each room has a fixed deck of numbered cartelas; a player may hold up to maxCardsPerPlayer per round.
 * - Once minPlayersToStart different players hold cartelas, a lobbyDuration countdown starts.
 * - 75 balls are drawn. Any full row, column, diagonal or the four corners is BINGO (centre is FREE).
 * - The first valid BINGO pauses the draw for claimWindowMs. Every cartela that also has BINGO and is
 *   claimed in that window shares the prize equally.
 * - A false BINGO puts that cartela out for the rest of the round.
 * - If a completed cartela is not claimed within autoBingoAfterCalls further balls, the game calls it.
 * - If no cartela can win (all disqualified), every stake is refunded.
 */
export const DEFAULT_GAME_RULES = {
  minPlayersToStart: 2,
  lobbyDuration: 30,
  claimWindowMs: 5000,
  autoBingoAfterCalls: 3,
  maxCardsPerPlayer: 5
};

const TOTAL_BALLS = 75;

export interface PurchasedTicket {
  ticketId: string;
  cardNumber: number;
  playerId: string;
  username: string;
  grid: BingoGrid;
  fingerprintHash: string;
  purchasedAt: string;
  isBot?: boolean;
  bonusPaid?: number;
  cashPaid?: number;
  bonusConsumedRecords?: Array<{ rewardId: string; amount: number }>;
}

export interface WinnerRecord {
  ticketId: string;
  cardNumber: number;
  playerId: string;
  username: string;
  patternsWon: string[];
  winningNumbers: Record<string, number[]>;
  payoutAmount: number;
  patternType: string;
  claimedAtBallIndex: number;
  isBot?: boolean;
  autoClaimed?: boolean;
  sharedWith?: number;
}

export interface RoomConfig {
  roomId: string;
  roomName: string;
  betPerCard: number;      // Base in USD
  etbEquivalent: number;   // Equivalent in ETB
  rakePercent: number;     // 20% (or 0% if 5 cards or fewer)
  lobbyDuration: number;   // Countdown seconds once enough players joined
  drawIntervalMs: number;  // Milliseconds per ball
  totalCatalogCards: number; // 200 numbered cartelas
  minPlayersToStart?: number;
  maxCardsPerPlayer?: number;
  claimWindowMs?: number;       // 0 settles the first valid BINGO immediately
  autoBingoAfterCalls?: number; // 0 turns auto-BINGO off (except on the last ball)
  badge?: string;
}

export interface PendingClaim {
  cardNumber: number;
  username: string;
  autoClaimed: boolean;
}

export interface GameRoomState {
  roomId: string;
  roomName: string;
  gameId: string;
  status: GameStatus;
  betPerCard: number;
  etbEquivalent: number;
  rakePercent: number;
  badge?: string;
  lobbyTimeRemaining: number;
  lobbyDuration: number;
  isCountdownActive?: boolean;
  drawIntervalMs: number;
  totalCatalogCards: number;
  minPlayersToStart: number;
  maxCardsPerPlayer: number;
  claimWindowMs: number;
  autoBingoAfterCalls: number;

  // Provably Fair Commitment
  commitmentHash: string;
  serverSeedRevealed?: string;
  fullShuffledBallsRevealed?: number[];

  // Live Draw State
  drawnBalls: number[];
  currentBall: { letter: 'B' | 'I' | 'N' | 'G' | 'O'; number: number } | null;
  totalBallsToDraw: number;
  claimWindowEndsAt: number | null;
  pendingClaims: PendingClaim[];
  disqualifiedCardNumbers: number[];
  roundRefunded: boolean;

  // Prize Pool (80% Winner / 20% Owner, or 100% Winner if 5 cards or fewer)
  totalCardsSold: number;
  totalPot: number;
  houseRakeAmount: number;
  playerPayoutPool: number;
  winnerPayoutAmount: number;
  winnerPayoutPercent: number;
  isFivePlayerBonus: boolean;
  fullHousePot: number;
  linePot: number;
  fourCornersPot: number;

  // Card Matrix & Selections
  takenCardNumbers: Record<number, { playerId: string; username: string; isBot: boolean }>;
  tickets: PurchasedTicket[];
  activePlayersCount: number;
  winners: WinnerRecord[];
}

export interface RoomSummary {
  roomId: string;
  roomName: string;
  betPerCard: number;
  etbEquivalent: number;
  badge?: string;
  status: GameStatus;
  lobbyTimeRemaining: number;
  lobbyDuration: number;
  isCountdownActive?: boolean;
  activePlayersCount: number;
  totalCardsSold: number;
  totalCatalogCards: number;
  minPlayersToStart: number;
  maxCardsPerPlayer: number;
  totalPot: number;
  winnerPayoutAmount: number;
  playerPayoutPool: number;
  isFivePlayerBonus: boolean;
  gameId: string;
}

export interface ClaimResult {
  success: boolean;
  message: string;
  winnerRecord?: WinnerRecord;
  pending?: boolean;
  disqualified?: boolean;
}

interface ClaimWindow {
  ballIndex: number;
  endsAt: number;
  claims: Map<string, { ticket: PurchasedTicket; verification: WinningPatternResult; autoClaimed: boolean }>;
  timer: NodeJS.Timeout | null;
  settling: boolean;
}

function describePattern(verification: WinningPatternResult): string {
  if (verification.patternTypes.hasLine) return 'Line';
  if (verification.patternTypes.hasCorners) return 'Four Corners';
  return 'Full House';
}

export class GameRoom {
  private io: Server;
  public config: RoomConfig;
  public gameId: string = '';
  public status: GameStatus = 'lobby';
  public lobbyTimeRemaining: number = DEFAULT_GAME_RULES.lobbyDuration;

  // Secret Server State
  private serverSeed: string = '';
  private shuffledBalls: number[] = [];
  private currentBallIndex: number = 0;
  private serverSecret: string = '';

  // Fixed numbered cartela deck (1..totalCatalogCards), the same every round
  public cardCatalog: Map<number, BingoGrid> = new Map();
  public tickets: Map<string, PurchasedTicket> = new Map();
  public cardToTicketMap: Map<number, PurchasedTicket> = new Map();
  public winners: WinnerRecord[] = [];

  // Round rule state
  public disqualifiedTickets: Set<string> = new Set();
  private completedAtBall: Map<string, number> = new Map();
  private claimWindow: ClaimWindow | null = null;
  private roundRefunded: boolean = false;

  // Timers
  private lobbyTimer: NodeJS.Timeout | null = null;
  private drawTimer: NodeJS.Timeout | null = null;
  private resetTimer: NodeJS.Timeout | null = null;
  public isCountdownActive: boolean = false;
  private lockQueues: Map<string, Promise<void>> = new Map();

  public get minPlayersToStart(): number {
    return Math.max(1, this.config.minPlayersToStart ?? DEFAULT_GAME_RULES.minPlayersToStart);
  }

  public get maxCardsPerPlayer(): number {
    return Math.max(1, this.config.maxCardsPerPlayer ?? DEFAULT_GAME_RULES.maxCardsPerPlayer);
  }

  public get claimWindowMs(): number {
    return Math.max(0, this.config.claimWindowMs ?? DEFAULT_GAME_RULES.claimWindowMs);
  }

  public get autoBingoAfterCalls(): number {
    return Math.max(0, this.config.autoBingoAfterCalls ?? DEFAULT_GAME_RULES.autoBingoAfterCalls);
  }

  public get lobbyDuration(): number {
    return Math.max(1, this.config.lobbyDuration || DEFAULT_GAME_RULES.lobbyDuration);
  }

  public get totalCatalogCards(): number {
    return this.config.totalCatalogCards || 200;
  }

  public getActivePlayersCount(): number {
    return new Set(Array.from(this.tickets.values()).map(t => t.playerId)).size;
  }

  public getPlayerCardCount(playerId: string): number {
    let count = 0;
    for (const t of this.tickets.values()) {
      if (t.playerId === playerId) count++;
    }
    return count;
  }

  private async withLock<T>(key: string, action: () => Promise<T> | T): Promise<T> {
    const current = this.lockQueues.get(key) || Promise.resolve();
    let releaseLock = () => {};
    const next = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.lockQueues.set(key, next);

    try {
      await current;
      return await action();
    } finally {
      releaseLock();
      if (this.lockQueues.get(key) === next) {
        this.lockQueues.delete(key);
      }
    }
  }

  private db: DatabaseService;

  constructor(io: Server, config: RoomConfig, db: DatabaseService = databaseService) {
    this.io = io;
    this.config = config;
    this.db = db;
    this.cardCatalog = getCartelaCatalog(this.totalCatalogCards);
    this.initNewGame();
    this.recoverOrRefundAbandonedGames();
  }

  public initNewGame() {
    this.clearTimers();

    this.gameId = `game_${this.config.roomId}_${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 900 + 100)}`;
    this.status = 'lobby';
    this.lobbyTimeRemaining = this.lobbyDuration;
    this.isCountdownActive = false;
    this.currentBallIndex = 0;
    this.tickets.clear();
    this.cardToTicketMap.clear();
    this.winners = [];
    this.disqualifiedTickets = new Set();
    this.completedAtBall = new Map();
    this.claimWindow = null;
    this.roundRefunded = false;
    this.serverSecret = `SECRET_${this.config.roomId}_${crypto.randomBytes(32).toString('hex')}`;

    // Pre-generate 75-ball deck and compute GLI-11 SHA-256 commitment hash
    this.serverSeed = generateServerSeed();
    this.shuffledBalls = generateShuffledBalls();

    // Persist game to authoritative database
    try {
      (this.db || databaseService).createGame({
        id: this.gameId,
        roomId: this.config.roomId,
        betPerCard: this.config.betPerCard,
        serverSecret: this.serverSecret,
        commitmentHash: this.getCommitmentHash()
      });
    } catch (e) {
      console.warn(`[GameRoom] Warning persisting game ${this.gameId} to DB:`, (e as any).message);
    }

    console.log(`[GameRoom ${this.config.roomId}] New Game initialized: ${this.gameId}`);

    this.broadcastState();
  }

  /**
   * VULN-06 Recovery: Scans database for abandoned games in this room and refunds human players
   */
  public recoverOrRefundAbandonedGames(): number {
    let refundedTicketsCount = 0;
    try {
      const dbInstance = this.db || databaseService;
      const abandonedGames = dbInstance.getActiveOrLobbyGames(this.config.roomId);
      for (const game of abandonedGames) {
        // Only process previous games, not the currently initialized one
        if (game.id === this.gameId) continue;

        console.log(`[GameRoomManager] Recovering abandoned game ${game.id} in room ${this.config.roomId}...`);
        const tickets = dbInstance.getTicketsForGame(game.id);

        for (const ticket of tickets) {
          if (ticket.is_bot) continue; // Skip bot tickets

          const refundRef = `refund_game_${ticket.id}`;
          const existingRefund = dbInstance.getLedgerTransactionByReference(refundRef);
          if (existingRefund) continue; // Already refunded

          // Atomically refund bet to player wallet and record ledger entry
          try {
            dbInstance.transaction(() => {
              const wallet = dbInstance.getOrCreateWallet(ticket.user_id);
              const refundAmount = game.bet_per_card;

              // Check if purchase was made partially or fully with bonus balance
              const betTx = (dbInstance as any).db.prepare(
                "SELECT description FROM ledger_transactions WHERE user_id = ? AND game_id = ? AND type = 'BET' AND description LIKE ?"
              ).get(ticket.user_id, game.id, `%#${ticket.card_number} %`) as { description: string } | undefined;

              let bonusPaid = 0;
              let cashPaid = refundAmount;

              if (betTx && betTx.description && betTx.description.includes('[Paid: ')) {
                const match = betTx.description.match(/\[Paid:\s*([0-9.]+)\s*Bonus\s*\+\s*([0-9.]+)\s*Cash\]/i);
                if (match) {
                  bonusPaid = parseFloat(match[1]) || 0;
                  cashPaid = parseFloat(match[2]) || 0;
                }
              }

              if (bonusPaid > 0) {
                // Properly split refund into bonus and cash
                dbInstance.rewardService.refundPurchase(ticket.user_id, bonusPaid, cashPaid, []);

                let desc = `Automatic refund for crashed/interrupted game ${game.id} (Card #${ticket.card_number})`;
                desc += ` [Refunded: ${bonusPaid.toFixed(2)} Bonus + ${cashPaid.toFixed(2)} Cash]`;

                const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                (dbInstance as any).db.prepare(`
                  INSERT INTO ledger_transactions (
                    id, user_id, username, type, amount, balance_before, balance_after,
                    game_id, ticket_id, reference_id, description, created_at
                  ) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  entryId,
                  ticket.user_id,
                  ticket.username,
                  refundAmount,
                  wallet.balance,
                  wallet.balance + cashPaid,
                  game.id,
                  ticket.id,
                  refundRef,
                  desc,
                  new Date().toISOString()
                );
              } else {
                dbInstance.recordLedgerTransaction({
                  userId: ticket.user_id,
                  username: ticket.username,
                  type: 'REFUND',
                  amount: refundAmount,
                  gameId: game.id,
                  ticketId: ticket.id,
                  referenceId: refundRef,
                  description: `Automatic refund for crashed/interrupted game ${game.id} (Card #${ticket.card_number})`
                });
              }
              refundedTicketsCount++;
            });
          } catch (err: any) {
            console.error(`[GameRoomManager] Error refunding ticket ${ticket.id}:`, err.message);
          }
        }

        // Mark abandoned game as finished with cancellation timestamp
        dbInstance.updateGame(game.id, {
          status: 'finished',
          finished_at: new Date().toISOString()
        });
      }
    } catch (e: any) {
      console.warn(`[GameRoomManager] Abandoned game recovery warning for room ${this.config.roomId}:`, e.message);
    }
    return refundedTicketsCount;
  }

  private clearTimers() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    if (this.drawTimer) clearTimeout(this.drawTimer);
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.claimWindow?.timer) clearTimeout(this.claimWindow.timer);
    this.lobbyTimer = null;
    this.drawTimer = null;
    this.resetTimer = null;
  }

  public getCommitmentHash(): string {
    return computeCommitmentHash(this.shuffledBalls, this.serverSeed);
  }

  public getPublicState(): GameRoomState {
    const totalCardsSold = this.tickets.size;
    const pool = calculatePariMutuelPool({
      betPerCard: this.config.betPerCard,
      totalCardsSold,
      houseRakePercent: this.config.rakePercent
    });

    const drawnNumbers = this.shuffledBalls.slice(0, this.currentBallIndex);
    const lastBallNum = drawnNumbers.length > 0 ? drawnNumbers[drawnNumbers.length - 1] : null;

    const takenCards: Record<number, { playerId: string; username: string; isBot: boolean }> = {};
    for (const [cardNum, ticket] of this.cardToTicketMap.entries()) {
      takenCards[cardNum] = {
        playerId: ticket.playerId,
        username: ticket.username,
        isBot: Boolean(ticket.isBot)
      };
    }

    const pendingClaims: PendingClaim[] = this.claimWindow
      ? Array.from(this.claimWindow.claims.values()).map(c => ({
          cardNumber: c.ticket.cardNumber,
          username: c.ticket.username,
          autoClaimed: c.autoClaimed
        }))
      : [];

    const disqualifiedCardNumbers = Array.from(this.disqualifiedTickets)
      .map(id => this.tickets.get(id)?.cardNumber)
      .filter((n): n is number => typeof n === 'number');

    return {
      roomId: this.config.roomId,
      roomName: this.config.roomName,
      gameId: this.gameId,
      status: this.status,
      betPerCard: this.config.betPerCard,
      etbEquivalent: this.config.etbEquivalent,
      rakePercent: this.config.rakePercent,
      badge: this.config.badge,
      lobbyTimeRemaining: this.lobbyTimeRemaining,
      lobbyDuration: this.lobbyDuration,
      isCountdownActive: this.isCountdownActive,
      drawIntervalMs: this.config.drawIntervalMs,
      totalCatalogCards: this.totalCatalogCards,
      minPlayersToStart: this.minPlayersToStart,
      maxCardsPerPlayer: this.maxCardsPerPlayer,
      claimWindowMs: this.claimWindowMs,
      autoBingoAfterCalls: this.autoBingoAfterCalls,
      commitmentHash: this.getCommitmentHash(),
      serverSeedRevealed: this.status === 'finished' ? this.serverSeed : undefined,
      fullShuffledBallsRevealed: this.status === 'finished' ? this.shuffledBalls : undefined,
      drawnBalls: drawnNumbers,
      currentBall: lastBallNum ? { letter: getBallLetter(lastBallNum), number: lastBallNum } : null,
      totalBallsToDraw: TOTAL_BALLS,
      claimWindowEndsAt: this.claimWindow ? this.claimWindow.endsAt : null,
      pendingClaims,
      disqualifiedCardNumbers,
      roundRefunded: this.roundRefunded,
      totalCardsSold,
      totalPot: pool.totalPot,
      houseRakeAmount: pool.houseRakeAmount,
      playerPayoutPool: pool.winnerPayoutAmount,
      winnerPayoutAmount: pool.winnerPayoutAmount,
      winnerPayoutPercent: pool.winnerPayoutPercent,
      isFivePlayerBonus: pool.isFivePlayerBonus,
      fullHousePot: pool.winnerPayoutAmount,
      linePot: pool.winnerPayoutAmount,
      fourCornersPot: pool.winnerPayoutAmount,
      takenCardNumbers: takenCards,
      tickets: Array.from(this.tickets.values()),
      activePlayersCount: this.getActivePlayersCount(),
      winners: this.winners
    };
  }

  public getSummary(): RoomSummary {
    const pool = calculatePariMutuelPool({
      betPerCard: this.config.betPerCard,
      totalCardsSold: this.tickets.size,
      houseRakePercent: this.config.rakePercent
    });

    return {
      roomId: this.config.roomId,
      roomName: this.config.roomName,
      betPerCard: this.config.betPerCard,
      etbEquivalent: this.config.etbEquivalent,
      badge: this.config.badge,
      status: this.status,
      lobbyTimeRemaining: this.lobbyTimeRemaining,
      lobbyDuration: this.lobbyDuration,
      isCountdownActive: this.isCountdownActive,
      activePlayersCount: this.getActivePlayersCount(),
      totalCardsSold: this.tickets.size,
      totalCatalogCards: this.totalCatalogCards,
      minPlayersToStart: this.minPlayersToStart,
      maxCardsPerPlayer: this.maxCardsPerPlayer,
      totalPot: pool.totalPot,
      winnerPayoutAmount: pool.winnerPayoutAmount,
      playerPayoutPool: pool.winnerPayoutAmount,
      isFivePlayerBonus: pool.isFivePlayerBonus,
      gameId: this.gameId
    };
  }

  public broadcastState() {
    this.io.to(`room_${this.config.roomId}`).emit('ROOM_STATE_UPDATE', this.getPublicState());
  }

  private emitToRoom(event: string, payload: Record<string, any>) {
    if (this.io && typeof this.io.to === 'function') {
      const roomTarget = this.io.to(`room_${this.config.roomId}`);
      if (roomTarget && typeof roomTarget.emit === 'function') {
        roomTarget.emit(event, payload);
      }
    }
  }

  private stopLobbyCountdown() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.lobbyTimer = null;
    this.isCountdownActive = false;
    this.lobbyTimeRemaining = this.lobbyDuration;
  }

  public startLobbyCountdown() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.isCountdownActive = true;
    this.lobbyTimeRemaining = this.lobbyDuration;

    this.emitToRoom('LOBBY_COUNTDOWN_STARTED', {
      roomId: this.config.roomId,
      timeRemaining: this.lobbyTimeRemaining,
      totalCardsSold: this.tickets.size,
      activePlayersCount: this.getActivePlayersCount()
    });

    this.broadcastState();

    this.lobbyTimer = setInterval(() => {
      if (this.status !== 'lobby') {
        if (this.lobbyTimer) clearInterval(this.lobbyTimer);
        this.lobbyTimer = null;
        return;
      }

      if (this.lobbyTimeRemaining > 0) {
        this.lobbyTimeRemaining--;
        this.emitToRoom('LOBBY_TICK', {
          roomId: this.config.roomId,
          timeRemaining: this.lobbyTimeRemaining,
          isCountdownActive: this.isCountdownActive,
          totalCardsSold: this.tickets.size,
          activePlayersCount: this.getActivePlayersCount()
        });

        if (this.lobbyTimeRemaining === 0) {
          if (this.getActivePlayersCount() >= this.minPlayersToStart) {
            this.transitionToActiveDraw();
          } else {
            this.stopLobbyCountdown();
            this.broadcastState();
          }
        }
      }
    }, 1000);
  }

  private transitionToActiveDraw() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.lobbyTimer = null;
    this.isCountdownActive = false;

    this.status = 'active';
    this.currentBallIndex = 0;

    const pool = calculatePariMutuelPool({
      betPerCard: this.config.betPerCard,
      totalCardsSold: this.tickets.size,
      houseRakePercent: this.config.rakePercent
    });

    try {
      const dbInstance = this.db || databaseService;
      dbInstance.updateGame(this.gameId, {
        status: 'active',
        total_cards_sold: this.tickets.size,
        prize_pool: pool.totalPot
      });
    } catch (e: any) {
      console.warn(`[GameRoom] Error updating game ${this.gameId} to active in DB:`, e.message);
    }

    this.broadcastState();

    this.emitToRoom('GAME_STARTED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      totalCards: this.tickets.size,
      totalPot: pool.totalPot,
      winnerPayoutAmount: pool.winnerPayoutAmount,
      isFivePlayerBonus: pool.isFivePlayerBonus
    });

    this.scheduleNextBall();
  }

  private scheduleNextBall() {
    if (this.drawTimer) clearTimeout(this.drawTimer);
    this.drawTimer = setTimeout(() => {
      this.drawTimer = null;
      this.drawNextBall();
    }, this.config.drawIntervalMs);
  }

  private drawNextBall() {
    if (this.status !== 'active' || this.claimWindow) return;
    if (this.currentBallIndex >= TOTAL_BALLS) {
      this.settleAfterLastBall();
      return;
    }

    const ballNum = this.shuffledBalls[this.currentBallIndex];
    this.currentBallIndex++;

    const ballLetter = getBallLetter(ballNum);
    const drawnSoFar = this.shuffledBalls.slice(0, this.currentBallIndex);

    try {
      const dbInstance = this.db || databaseService;
      dbInstance.recordDrawnBall(this.gameId, this.currentBallIndex, ballNum, ballLetter);
    } catch (e: any) {
      // Non-blocking for live draw
    }

    this.emitToRoom('BALL_DRAWN', {
      roomId: this.config.roomId,
      ball: { letter: ballLetter, number: ballNum },
      ballIndex: this.currentBallIndex,
      drawnBalls: drawnSoFar,
      totalBalls: TOTAL_BALLS
    });

    // Remember the ball on which each cartela first completed a pattern (for auto-BINGO)
    for (const ticket of this.tickets.values()) {
      if (this.completedAtBall.has(ticket.ticketId) || this.disqualifiedTickets.has(ticket.ticketId)) continue;
      if (verifyWinningPatterns(ticket.grid, drawnSoFar).hasWon) {
        this.completedAtBall.set(ticket.ticketId, this.currentBallIndex);
      }
    }

    if (this.tryAutoBingo(this.currentBallIndex >= TOTAL_BALLS)) return;

    if (this.currentBallIndex >= TOTAL_BALLS) {
      this.settleAfterLastBall();
    } else {
      this.scheduleNextBall();
    }
  }

  /**
   * If a completed cartela has gone unclaimed for autoBingoAfterCalls balls (or the last ball is out),
   * the game calls BINGO for the cartela(s) that completed first.
   */
  private tryAutoBingo(isLastBall: boolean): boolean {
    if (this.claimWindow) return false;
    let earliest = Infinity;
    for (const [ticketId, ballIndex] of this.completedAtBall) {
      if (!this.disqualifiedTickets.has(ticketId) && ballIndex < earliest) earliest = ballIndex;
    }
    if (earliest === Infinity) return false;

    const after = this.autoBingoAfterCalls;
    const due = isLastBall || (after > 0 && this.currentBallIndex - earliest >= after);
    if (!due) return false;

    const drawn = this.shuffledBalls.slice(0, this.currentBallIndex);
    for (const [ticketId, ballIndex] of this.completedAtBall) {
      if (ballIndex !== earliest || this.disqualifiedTickets.has(ticketId)) continue;
      const ticket = this.tickets.get(ticketId);
      if (ticket) this.registerClaim(ticket, verifyWinningPatterns(ticket.grid, drawn), true);
    }
    if (this.claimWindowMs === 0) {
      void this.settleClaimWindow();
    }
    return true;
  }

  private settleAfterLastBall() {
    if (this.status !== 'active' || this.claimWindow) return;
    if (this.tryAutoBingo(true)) return;
    // Nobody can win (every cartela was disqualified): everyone gets their stake back
    this.refundRound('No winning cartela this round');
  }

  /**
   * Select a specific numbered cartela (e.g. Card #22)
   */
  public async selectCardNumber(
    playerId: string,
    username: string,
    cardNumber: number,
    isBot: boolean = false
  ): Promise<PurchasedTicket> {
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > this.totalCatalogCards) {
      throw new Error(`Invalid cartela number. Pick a number from 1 to ${this.totalCatalogCards}.`);
    }

    return await this.withLock(`player_${playerId}`, () => this.withLock(`card_${this.gameId}_${cardNumber}`, async () => {
      // If the room finished, start a fresh lobby
      if (this.status !== 'lobby') {
        if (this.status === 'finished') {
          this.initNewGame();
        } else {
          throw new Error('Active ball draw is in progress. Round will reset in a moment!');
        }
      }

      if (this.cardToTicketMap.has(cardNumber)) {
        const existing = this.cardToTicketMap.get(cardNumber);
        if (existing && existing.playerId === playerId) {
          return existing; // Already owned by this player
        }
        throw new Error(`Card #${cardNumber} is already taken by another player`);
      }

      if (this.getPlayerCardCount(playerId) >= this.maxCardsPerPlayer) {
        throw new Error(`You can play at most ${this.maxCardsPerPlayer} cartelas per round`);
      }

      const grid = this.cardCatalog.get(cardNumber)!;

      let bonusPaid = 0;
      let cashPaid = this.config.betPerCard;
      let bonusConsumedRecords: Array<{ rewardId: string; amount: number }> = [];

      const fingerprintHash = computeTicketFingerprint(grid, playerId, this.gameId, this.serverSecret);
      const ticketId = `tkt_c${cardNumber}_${Date.now().toString().slice(-5)}`;

      const dbInstance = this.db || databaseService;
      if (!isBot) {
        dbInstance.transaction(() => {
          const split = dbInstance.rewardService.consumeBonusForPurchase(
            playerId,
            this.config.betPerCard,
            'BINGO_CARD',
            this.gameId
          );
          bonusPaid = split.bonusPaid;
          cashPaid = split.cashPaid;
          bonusConsumedRecords = split.bonusConsumedRecords;

          const wallet = dbInstance.getWallet(playerId)!;
          const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          let desc = `Bingo Card #${cardNumber} for ${this.config.roomName} (${this.gameId})`;
          if (bonusPaid > 0) {
            desc += ` [Paid: ${bonusPaid.toFixed(2)} Bonus + ${cashPaid.toFixed(2)} Cash]`;
          }

          (dbInstance as any).db.prepare(`
            INSERT INTO ledger_transactions (
              id, user_id, username, type, amount, balance_before, balance_after,
              game_id, description, created_at
            ) VALUES (?, ?, ?, 'BET', ?, ?, ?, ?, ?, ?)
          `).run(
            entryId,
            playerId,
            username,
            this.config.betPerCard,
            wallet.balance + cashPaid,
            wallet.balance,
            this.gameId,
            desc,
            new Date().toISOString()
          );

          dbInstance.createPlayerTicket({
            id: ticketId,
            gameId: this.gameId,
            cardNumber,
            userId: playerId,
            username,
            gridJson: JSON.stringify(grid),
            fingerprintHash,
            isBot
          });

          // Authoritative Room Play Reward: Record qualifying human card purchase
          dbInstance.rewardService.recordCardPurchase(playerId, this.config.roomId, 1);
        });
      } else {
        try {
          dbInstance.createPlayerTicket({
            id: ticketId,
            gameId: this.gameId,
            cardNumber,
            userId: playerId,
            username,
            gridJson: JSON.stringify(grid),
            fingerprintHash,
            isBot
          });
        } catch (e) {
          // Ignore in mock/unit contexts
        }
      }

      const ticket: PurchasedTicket = {
        ticketId,
        cardNumber,
        playerId,
        username,
        grid,
        fingerprintHash,
        purchasedAt: new Date().toISOString(),
        isBot,
        bonusPaid,
        cashPaid,
        bonusConsumedRecords
      };

      this.tickets.set(ticketId, ticket);
      this.cardToTicketMap.set(cardNumber, ticket);

      // The countdown starts once enough different players have joined the round
      if (this.getActivePlayersCount() >= this.minPlayersToStart && !this.isCountdownActive) {
        this.startLobbyCountdown();
      } else {
        this.broadcastState();
      }

      return ticket;
    }));
  }

  /**
   * Lock a batch of selected cards in one operation
   */
  public async lockMultipleCards(
    playerId: string,
    username: string,
    cardNumbers: number[]
  ): Promise<PurchasedTicket[]> {
    if (this.status !== 'lobby') {
      if (this.status === 'finished') {
        this.initNewGame();
      } else {
        throw new Error('Active ball draw is in progress. Round will reset in a moment!');
      }
    }

    const unique = Array.from(new Set(cardNumbers));
    for (const cardNum of unique) {
      if (!Number.isInteger(cardNum) || cardNum < 1 || cardNum > this.totalCatalogCards) {
        throw new Error(`Invalid cartela number. Pick a number from 1 to ${this.totalCatalogCards}.`);
      }
    }
    const newCards = unique.filter(n => this.cardToTicketMap.get(n)?.playerId !== playerId);
    if (this.getPlayerCardCount(playerId) + newCards.length > this.maxCardsPerPlayer) {
      throw new Error(`You can play at most ${this.maxCardsPerPlayer} cartelas per round`);
    }

    const purchased: PurchasedTicket[] = [];
    for (const cardNum of unique) {
      const existing = this.cardToTicketMap.get(cardNum);
      if (existing && existing.playerId === playerId) {
        purchased.push(existing);
        continue;
      }
      const ticket = await this.selectCardNumber(playerId, username, cardNum, false);
      purchased.push(ticket);
    }
    return purchased;
  }

  /**
   * Give a human player's stake back (bonus to bonus, cash to cash) with a REFUND ledger entry.
   * Must run inside a database transaction.
   */
  private refundTicketStake(ticket: PurchasedTicket, description: string, referenceId: string | null) {
    const dbInstance = this.db || databaseService;
    dbInstance.rewardService.refundPurchase(
      ticket.playerId,
      ticket.bonusPaid || 0,
      ticket.cashPaid || 0,
      ticket.bonusConsumedRecords
    );

    // Authoritative Room Play Reward: Reverse counter for a refunded card
    dbInstance.rewardService.recordCardRefund(ticket.playerId, this.config.roomId, 1);

    let desc = description;
    if ((ticket.bonusPaid || 0) > 0) {
      desc += ` [Refunded: ${(ticket.bonusPaid || 0).toFixed(2)} Bonus + ${(ticket.cashPaid || 0).toFixed(2)} Cash]`;
    }

    const wallet = dbInstance.getWallet(ticket.playerId)!;
    const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    (dbInstance as any).db.prepare(`
      INSERT INTO ledger_transactions (
        id, user_id, username, type, amount, balance_before, balance_after,
        game_id, ticket_id, reference_id, description, created_at
      ) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      ticket.playerId,
      ticket.username,
      this.config.betPerCard,
      wallet.balance - (ticket.cashPaid || 0),
      wallet.balance,
      this.gameId,
      referenceId ? ticket.ticketId : null,
      referenceId,
      desc,
      new Date().toISOString()
    );
  }

  /**
   * Deselect / Refund a card during lobby phase
   */
  public async deselectCardNumber(
    playerId: string,
    cardNumber: number
  ): Promise<boolean> {
    return await this.withLock(`card_${this.gameId}_${cardNumber}`, async () => {
      if (this.status !== 'lobby') {
        throw new Error('Cards can only be deselected during the Lobby phase');
      }

      const ticket = this.cardToTicketMap.get(cardNumber);
      if (!ticket || ticket.playerId !== playerId) {
        throw new Error('Card not found or not owned by you');
      }

      this.tickets.delete(ticket.ticketId);
      this.cardToTicketMap.delete(cardNumber);

      // If players drop below the minimum, stop the countdown
      if (this.getActivePlayersCount() < this.minPlayersToStart && this.isCountdownActive) {
        this.stopLobbyCountdown();
      }

      const dbInstance = this.db || databaseService;
      dbInstance.transaction(() => {
        // Remove ticket from persistent database to prevent unique constraint collisions and ghost records
        dbInstance.deletePlayerTicket(this.gameId, cardNumber);

        if (!ticket.isBot) {
          this.refundTicketStake(ticket, `Refund for Bingo Card #${cardNumber} (${this.gameId})`, null);
        }
      });

      this.broadcastState();
      return true;
    });
  }

  /**
   * Randomly select available cards for user
   */
  public async pickRandomCardForUser(
    playerId: string,
    username: string,
    isBot: boolean = false
  ): Promise<PurchasedTicket> {
    const availableNumbers: number[] = [];
    for (let i = 1; i <= this.totalCatalogCards; i++) {
      if (!this.cardToTicketMap.has(i)) {
        availableNumbers.push(i);
      }
    }

    if (availableNumbers.length === 0) {
      throw new Error('All cards in this room are already taken');
    }

    const randomIndex = crypto.randomInt(0, availableNumbers.length);
    const chosenNumber = availableNumbers[randomIndex];
    return this.selectCardNumber(playerId, username, chosenNumber, isBot);
  }

  /**
   * Get 5x5 Grid for Card Preview
   */
  public getCardPreview(cardNumber: number): BingoGrid | undefined {
    return this.cardCatalog.get(cardNumber);
  }

  /**
   * Add a verified BINGO to the claim window, opening it (and pausing the draw) on the first one.
   */
  private registerClaim(ticket: PurchasedTicket, verification: WinningPatternResult, autoClaimed: boolean) {
    if (!this.claimWindow) {
      if (this.drawTimer) clearTimeout(this.drawTimer);
      this.drawTimer = null;
      this.claimWindow = {
        ballIndex: this.currentBallIndex,
        endsAt: Date.now() + this.claimWindowMs,
        claims: new Map(),
        timer: null,
        settling: false
      };
      if (this.claimWindowMs > 0) {
        this.claimWindow.timer = setTimeout(() => {
          void this.settleClaimWindow();
        }, this.claimWindowMs);
      }
    }

    this.claimWindow.claims.set(ticket.ticketId, { ticket, verification, autoClaimed });

    this.emitToRoom('BINGO_CALLED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      cardNumber: ticket.cardNumber,
      username: ticket.username,
      autoClaimed,
      claimWindowEndsAt: this.claimWindow.endsAt,
      ballIndex: this.currentBallIndex,
      claimCount: this.claimWindow.claims.size
    });
    this.broadcastState();
  }

  public async handleClaimBingo(
    playerId: string,
    ticketId: string
  ): Promise<ClaimResult> {
    return await this.withLock(`claim_${this.gameId}`, async () => {
      if (this.status !== 'active' || this.winners.length > 0 || this.claimWindow?.settling) {
        return { success: false, message: 'Game has already concluded or is not in active drawing phase' };
      }

      const dbInstance = this.db || databaseService;

      // Check persistent database for existing claim on this game and ticket
      const existingClaim = dbInstance.getBingoClaim(this.gameId, ticketId);
      if (existingClaim) {
        return { success: false, message: 'Ticket has already been claimed for this game' };
      }

      const ticket = this.tickets.get(ticketId);
      if (!ticket) {
        return { success: false, message: 'Ticket not found in current game room' };
      }

      if (ticket.playerId !== playerId) {
        return { success: false, message: 'Unauthorized ticket claim' };
      }

      const expectedFingerprint = computeTicketFingerprint(
        ticket.grid,
        ticket.playerId,
        this.gameId,
        this.serverSecret
      );
      if (ticket.fingerprintHash !== expectedFingerprint) {
        return { success: false, message: 'Security Alert: Ticket fingerprint mismatch!' };
      }

      if (this.disqualifiedTickets.has(ticketId)) {
        return { success: false, disqualified: true, message: `Card #${ticket.cardNumber} is out for this round after a false BINGO.` };
      }

      if (this.claimWindow?.claims.has(ticketId)) {
        return { success: false, pending: true, message: `Card #${ticket.cardNumber} has already called BINGO. Results in a moment.` };
      }

      const officialDrawnBalls = this.shuffledBalls.slice(0, this.currentBallIndex);
      const verification: WinningPatternResult = verifyWinningPatterns(ticket.grid, officialDrawnBalls);

      if (!verification.hasWon) {
        // False BINGO: the cartela is out for the rest of this round
        this.disqualifiedTickets.add(ticketId);
        this.completedAtBall.delete(ticketId);
        this.emitToRoom('BINGO_FALSE_CLAIM', {
          roomId: this.config.roomId,
          gameId: this.gameId,
          cardNumber: ticket.cardNumber,
          username: ticket.username
        });
        this.broadcastState();
        if (this.status === 'active' && !this.claimWindow && this.currentBallIndex >= TOTAL_BALLS) {
          this.settleAfterLastBall();
        }
        return {
          success: false,
          disqualified: true,
          message: `Invalid Bingo claim! Card #${ticket.cardNumber} has no complete line yet, so it is out for this round.`
        };
      }

      const patternType = describePattern(verification);
      const provisional: WinnerRecord = {
        ticketId,
        cardNumber: ticket.cardNumber,
        playerId,
        username: ticket.username,
        patternsWon: Object.keys(verification.patterns),
        winningNumbers: verification.patterns,
        payoutAmount: 0,
        patternType: `BINGO (${patternType})`,
        claimedAtBallIndex: this.currentBallIndex,
        isBot: ticket.isBot
      };

      this.registerClaim(ticket, verification, false);

      if (this.claimWindowMs === 0) {
        await this.settleClaimWindowLocked();
        const record = this.winners.find(w => w.ticketId === ticketId) || provisional;
        const shared = (record.sharedWith || 1) > 1 ? ` (shared by ${record.sharedWith} cartelas)` : '';
        return { success: true, message: `BINGO Verified! You won ${record.payoutAmount.toFixed(2)} Birr${shared}!`, winnerRecord: record };
      }

      return {
        success: true,
        pending: true,
        message: `BINGO! Card #${ticket.cardNumber} is verified. Anyone else with BINGO on this ball shares the prize. Results in a moment.`,
        winnerRecord: provisional
      };
    });
  }

  private async settleClaimWindow() {
    await this.withLock(`claim_${this.gameId}`, () => this.settleClaimWindowLocked());
  }

  /**
   * Close the claim window: split the prize between every claimed cartela and finish the round.
   * Caller must hold the claim lock.
   */
  private async settleClaimWindowLocked() {
    const window = this.claimWindow;
    if (!window || window.settling || this.status !== 'active') return;
    window.settling = true;
    if (window.timer) clearTimeout(window.timer);
    window.timer = null;

    const dbInstance = this.db || databaseService;
    const gameId = this.gameId;
    const pool = calculatePariMutuelPool({
      betPerCard: this.config.betPerCard,
      totalCardsSold: this.tickets.size,
      houseRakePercent: this.config.rakePercent
    });

    const claims = Array.from(window.claims.values());
    const shares = splitPrize(pool.winnerPayoutAmount, claims.length);

    for (let i = 0; i < claims.length; i++) {
      const { ticket, verification, autoClaimed } = claims[i];
      const payoutAmount = shares[i];
      const patternType = describePattern(verification);
      const shareNote = claims.length > 1 ? `, shared ${claims.length} ways` : '';
      const description = `Bingo Winner (${patternType} - ${pool.winnerPayoutPercent}% Payout${shareNote}) on Card #${ticket.cardNumber} in ${this.config.roomName}`;

      const winnerRecord: WinnerRecord = {
        ticketId: ticket.ticketId,
        cardNumber: ticket.cardNumber,
        playerId: ticket.playerId,
        username: ticket.username,
        patternsWon: Object.keys(verification.patterns),
        winningNumbers: verification.patterns,
        payoutAmount,
        patternType: `BINGO (${patternType})`,
        claimedAtBallIndex: window.ballIndex,
        isBot: ticket.isBot,
        autoClaimed,
        sharedWith: claims.length
      };

      try {
        // Record idempotent claim in persistent database
        dbInstance.recordBingoClaim({
          gameId,
          ticketId: ticket.ticketId,
          userId: ticket.playerId,
          payoutAmount,
          patternType: winnerRecord.patternType
        });

        if (!ticket.isBot) {
          if (this.db && this.db !== databaseService) {
            const user = dbInstance.getUserById(ticket.playerId);
            if (user) {
              dbInstance.recordLedgerTransaction({
                userId: ticket.playerId,
                username: user.username,
                type: 'WIN_PAYOUT',
                amount: payoutAmount,
                description,
                gameId,
                ticketId: ticket.ticketId,
                referenceId: `claim_${gameId}_${ticket.ticketId}`
              });
            }
          } else {
            await ledgerService.recordTransaction(
              ticket.playerId,
              'win_payout',
              payoutAmount,
              description,
              gameId,
              ticket.ticketId,
              `claim_${gameId}_${ticket.ticketId}`
            );
          }
        }
      } catch (err: any) {
        console.error(`[GameRoom ${this.config.roomId}] Payout failed for ${ticket.ticketId} in ${gameId}:`, err.message);
      }

      this.winners.push(winnerRecord);
    }

    this.claimWindow = null;

    this.emitToRoom('BINGO_WINNER_ANNOUNCED', {
      roomId: this.config.roomId,
      gameId,
      winners: this.winners,
      winner: this.winners[0],
      patternsWon: this.winners[0]?.patternsWon || [],
      payoutAmount: this.winners[0]?.payoutAmount || 0,
      totalPrize: pool.winnerPayoutAmount,
      winnerCount: this.winners.length,
      winnerPayoutPercent: pool.winnerPayoutPercent,
      isFivePlayerBonus: pool.isFivePlayerBonus
    });

    this.transitionToFinished();
  }

  /**
   * End the round with nobody winning and give every human player their stake back.
   */
  private refundRound(reason: string) {
    const dbInstance = this.db || databaseService;
    for (const ticket of this.tickets.values()) {
      if (ticket.isBot) continue;
      const referenceId = `refund_game_${ticket.ticketId}`;
      try {
        if (dbInstance.getLedgerTransactionByReference(referenceId)) continue;
        dbInstance.transaction(() => {
          this.refundTicketStake(ticket, `${reason}: refund for Bingo Card #${ticket.cardNumber} (${this.gameId})`, referenceId);
        });
      } catch (err: any) {
        console.error(`[GameRoom ${this.config.roomId}] Refund failed for ${ticket.ticketId}:`, err.message);
      }
    }
    this.roundRefunded = true;
    this.emitToRoom('ROUND_REFUNDED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      reason
    });
    this.transitionToFinished();
  }

  private transitionToFinished() {
    this.clearTimers();
    this.claimWindow = null;
    this.status = 'finished';

    try {
      const dbInstance = this.db || databaseService;
      dbInstance.updateGame(this.gameId, {
        status: 'finished',
        finished_at: new Date().toISOString()
      });
    } catch (e: any) {
      console.warn(`[GameRoom] Error updating game ${this.gameId} to finished in DB:`, e.message);
    }

    this.broadcastState();

    this.emitToRoom('GAME_FINISHED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      winners: this.winners,
      refunded: this.roundRefunded,
      serverSeedRevealed: this.serverSeed,
      fullShuffledBallsRevealed: this.shuffledBalls
    });

    // Auto-reset room to lobby after 10 seconds
    this.resetTimer = setTimeout(() => {
      this.resetTimer = null;
      if (this.status === 'finished') {
        this.initNewGame();
      }
    }, 10000);
  }
}

function envInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export class MultiRoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private io: Server;
  private globalLobbyTimer: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
    this.initDefaultRooms();
    this.startGlobalLobbyBroadcast();
  }

  private initDefaultRooms() {
    const rules = {
      minPlayersToStart: envInt('MIN_PLAYERS_TO_START', DEFAULT_GAME_RULES.minPlayersToStart, 1),
      lobbyDuration: envInt('LOBBY_COUNTDOWN_SECONDS', DEFAULT_GAME_RULES.lobbyDuration, 5),
      claimWindowMs: envInt('CLAIM_WINDOW_MS', DEFAULT_GAME_RULES.claimWindowMs, 0),
      autoBingoAfterCalls: envInt('AUTO_BINGO_AFTER_CALLS', DEFAULT_GAME_RULES.autoBingoAfterCalls, 0),
      maxCardsPerPlayer: envInt('MAX_CARTELAS_PER_PLAYER', DEFAULT_GAME_RULES.maxCardsPerPlayer, 1)
    };
    const drawIntervalMs = envInt('DRAW_INTERVAL_MS', 3000, 500);

    const roomConfigs: RoomConfig[] = [
      { roomId: 'room_10birr', roomName: 'Starter Lounge', betPerCard: 10, etbEquivalent: 10, badge: '🔥 10 BIRR ENTRY' },
      { roomId: 'room_20birr', roomName: 'Bronze Room', betPerCard: 20, etbEquivalent: 20, badge: '⭐ 20 BIRR' },
      { roomId: 'room_50birr', roomName: 'Gold Arena', betPerCard: 50, etbEquivalent: 50, badge: '💎 50 BIRR POPULAR' },
      { roomId: 'room_100birr', roomName: 'Diamond High-Roller', betPerCard: 100, etbEquivalent: 100, badge: '👑 100 BIRR MAX VIP' }
    ].map(room => ({
      ...room,
      ...rules,
      rakePercent: 20.0,
      drawIntervalMs,
      totalCatalogCards: 200
    }));

    for (const cfg of roomConfigs) {
      const room = new GameRoom(this.io, cfg, databaseService);
      this.rooms.set(cfg.roomId, room);
      databaseService.rewardService.registerRoomConfig({
        roomId: cfg.roomId,
        roomName: cfg.roomName,
        cardPrice: cfg.betPerCard,
        badge: cfg.badge
      });
    }
  }

  private startGlobalLobbyBroadcast() {
    this.globalLobbyTimer = setInterval(() => {
      this.broadcastLobbyOverview();
    }, 1000);
  }

  public getLobbySummaries(): RoomSummary[] {
    return Array.from(this.rooms.values()).map(r => r.getSummary());
  }

  public broadcastLobbyOverview() {
    this.io.emit('LOBBY_OVERVIEW', this.getLobbySummaries());
  }

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }
}

export { GameRoom as GameRoomManager };
