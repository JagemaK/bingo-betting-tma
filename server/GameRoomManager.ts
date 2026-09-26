import crypto from 'crypto';
import { Server } from 'socket.io';
import {
  generate75BallCard,
  generateCardCatalog,
  generateShuffledBalls,
  generateServerSeed,
  computeCommitmentHash,
  computeTicketFingerprint,
  verifyWinningPatterns,
  calculatePariMutuelPool,
  getBallLetter,
  BingoGrid,
  WinningPatternResult
} from './BingoEngine.js';
import { ledgerService, UserAccount } from './LedgerService.js';
import { databaseService, DatabaseService } from './DatabaseService.js';

export type GameStatus = 'lobby' | 'active' | 'finished';

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
}

export interface RoomConfig {
  roomId: string;
  roomName: string;
  betPerCard: number;      // Base in USD
  etbEquivalent: number;   // Equivalent in ETB
  rakePercent: number;     // 20% (or 0% if 5 players)
  lobbyDuration: number;   // Seconds
  drawIntervalMs: number;  // Milliseconds per ball
  totalCatalogCards: number; // 200 numbered cards
  minCardsToStart?: number; // 5 cards / players minimum
  badge?: string;
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
  minCardsToStart: number;
  
  // Provably Fair Commitment
  commitmentHash: string;
  serverSeedRevealed?: string;
  fullShuffledBallsRevealed?: number[];

  // Live Draw State
  drawnBalls: number[];
  currentBall: { letter: 'B' | 'I' | 'N' | 'G' | 'O'; number: number } | null;
  totalBallsToDraw: number;
  
  // Prize Pool (80% Winner / 20% Owner, or 100% Winner if 5 players)
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
  minCardsToStart: number;
  totalPot: number;
  winnerPayoutAmount: number;
  playerPayoutPool: number;
  isFivePlayerBonus: boolean;
  gameId: string;
}

export class GameRoom {
  private io: Server;
  public config: RoomConfig;
  public gameId: string = '';
  public status: GameStatus = 'lobby';
  public lobbyTimeRemaining: number = 20;

  // Secret Server State
  private serverSeed: string = '';
  private shuffledBalls: number[] = [];
  private currentBallIndex: number = 0;
  private serverSecret: string = '';

  // Pre-generated Numbered Card Catalog (e.g. 1..200)
  public cardCatalog: Map<number, BingoGrid> = new Map();
  // Map of CardNumber -> PurchasedTicket
  public tickets: Map<string, PurchasedTicket> = new Map();
  public cardToTicketMap: Map<number, PurchasedTicket> = new Map();
  public winners: WinnerRecord[] = [];

  // Timers
  private lobbyTimer: NodeJS.Timeout | null = null;
  private drawTimer: NodeJS.Timeout | null = null;
  public isCountdownActive: boolean = false;
  private lockQueues: Map<string, Promise<void>> = new Map();

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
    this.lobbyTimeRemaining = 20;
    this.initNewGame();
    this.recoverOrRefundAbandonedGames();
  }

  public initNewGame() {
    this.clearTimers();

    this.gameId = `game_${this.config.roomId}_${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 900 + 100)}`;
    this.status = 'lobby';
    this.lobbyTimeRemaining = 20;
    this.isCountdownActive = false;
    this.currentBallIndex = 0;
    this.tickets.clear();
    this.cardToTicketMap.clear();
    this.winners = [];
    this.serverSecret = `SECRET_${this.config.roomId}_` + Math.random().toString(36);

    // Pre-generate 200 numbered unique Bingo Cards
    const totalCatalog = this.config.totalCatalogCards || 200;
    this.cardCatalog = generateCardCatalog(totalCatalog);

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

    // No demo bots. Countdown starts only when 5 cards are selected!
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
              ).get(ticket.user_id, game.id, `%#${ticket.card_number}%`) as { description: string } | undefined;

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
    if (this.drawTimer) clearInterval(this.drawTimer);
    this.lobbyTimer = null;
    this.drawTimer = null;
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
    const uniquePlayerIds = new Set(Array.from(this.tickets.values()).map(t => t.playerId));

    const takenCards: Record<number, { playerId: string; username: string; isBot: boolean }> = {};
    for (const [cardNum, ticket] of this.cardToTicketMap.entries()) {
      takenCards[cardNum] = {
        playerId: ticket.playerId,
        username: ticket.username,
        isBot: Boolean(ticket.isBot)
      };
    }

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
      lobbyDuration: 20,
      isCountdownActive: this.isCountdownActive,
      drawIntervalMs: this.config.drawIntervalMs,
      totalCatalogCards: 200,
      minCardsToStart: 5,
      commitmentHash: this.getCommitmentHash(),
      serverSeedRevealed: this.status === 'finished' ? this.serverSeed : undefined,
      fullShuffledBallsRevealed: this.status === 'finished' ? this.shuffledBalls : undefined,
      drawnBalls: drawnNumbers,
      currentBall: lastBallNum ? { letter: getBallLetter(lastBallNum), number: lastBallNum } : null,
      totalBallsToDraw: 75,
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
      activePlayersCount: Math.max(uniquePlayerIds.size, 1),
      winners: this.winners
    };
  }

  public getSummary(): RoomSummary {
    const pool = calculatePariMutuelPool({
      betPerCard: this.config.betPerCard,
      totalCardsSold: this.tickets.size,
      houseRakePercent: this.config.rakePercent
    });

    const uniquePlayerIds = new Set(Array.from(this.tickets.values()).map(t => t.playerId));

    return {
      roomId: this.config.roomId,
      roomName: this.config.roomName,
      betPerCard: this.config.betPerCard,
      etbEquivalent: this.config.etbEquivalent,
      badge: this.config.badge,
      status: this.status,
      lobbyTimeRemaining: this.lobbyTimeRemaining,
      lobbyDuration: 20,
      isCountdownActive: this.isCountdownActive,
      activePlayersCount: Math.max(uniquePlayerIds.size, 1),
      totalCardsSold: this.tickets.size,
      totalCatalogCards: 200,
      minCardsToStart: 5,
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

  public startLobbyCountdown() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.isCountdownActive = true;
    this.lobbyTimeRemaining = 20;

    this.io.to(`room_${this.config.roomId}`).emit('LOBBY_COUNTDOWN_STARTED', {
      roomId: this.config.roomId,
      timeRemaining: 20,
      totalCardsSold: this.tickets.size
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
        // Broadcast tick to both room subscribers and global
        this.io.to(`room_${this.config.roomId}`).emit('LOBBY_TICK', {
          roomId: this.config.roomId,
          timeRemaining: this.lobbyTimeRemaining,
          isCountdownActive: this.isCountdownActive,
          totalCardsSold: this.tickets.size
        });

        if (this.lobbyTimeRemaining === 0) {
          if (this.tickets.size >= 5) {
            this.transitionToActiveDraw();
          } else {
            if (this.lobbyTimer) clearInterval(this.lobbyTimer);
            this.lobbyTimer = null;
            this.isCountdownActive = false;
            this.lobbyTimeRemaining = 20;
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

    this.io.to(`room_${this.config.roomId}`).emit('GAME_STARTED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      totalCards: this.tickets.size,
      totalPot: pool.totalPot,
      winnerPayoutAmount: pool.winnerPayoutAmount,
      isFivePlayerBonus: pool.isFivePlayerBonus
    });

    this.startDrawingLoop();
  }

  private startDrawingLoop() {
    this.drawTimer = setInterval(() => {
      if (this.status !== 'active') return;

      if (this.currentBallIndex < this.shuffledBalls.length) {
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

        this.io.to(`room_${this.config.roomId}`).emit('BALL_DRAWN', {
          roomId: this.config.roomId,
          ball: { letter: ballLetter, number: ballNum },
          ballIndex: this.currentBallIndex,
          drawnBalls: drawnSoFar,
          totalBalls: 75
        });

        if (this.currentBallIndex >= 75) {
          this.transitionToFinished();
        }
      } else {
        this.transitionToFinished();
      }
    }, this.config.drawIntervalMs);
  }

  /**
   * Select or Deselect a specific numbered card (e.g. Card #22)
   */
  public async selectCardNumber(
    playerId: string,
    username: string,
    cardNumber: number,
    isBot: boolean = false
  ): Promise<PurchasedTicket> {
    return await this.withLock(`card_${this.gameId}_${cardNumber}`, async () => {
      // If the room finished or is active without human tickets, start a fresh lobby
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

      const grid = this.cardCatalog.get(cardNumber) || generate75BallCard();

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

      // Rule: The game countdown starts after it reaches 5 cards selected, giving 20 seconds waiting time
      if (this.tickets.size >= 5 && !this.isCountdownActive) {
        this.startLobbyCountdown();
      } else {
        this.broadcastState();
      }

      return ticket;
    });
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

    const purchased: PurchasedTicket[] = [];
    for (const cardNum of cardNumbers) {
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

      // If cards drop below 5, stop countdown
      if (this.tickets.size < 5 && this.isCountdownActive) {
        if (this.lobbyTimer) clearInterval(this.lobbyTimer);
        this.lobbyTimer = null;
        this.isCountdownActive = false;
        this.lobbyTimeRemaining = 20;
      }

      const dbInstance = this.db || databaseService;
      dbInstance.transaction(() => {
        // Remove ticket from persistent database to prevent unique constraint collisions and ghost records
        dbInstance.deletePlayerTicket(this.gameId, cardNumber);

        if (!ticket.isBot) {
          dbInstance.rewardService.refundPurchase(
            playerId,
            ticket.bonusPaid || 0,
            ticket.cashPaid || 0,
            ticket.bonusConsumedRecords
          );

          // Authoritative Room Play Reward: Reverse counter on lobby card deselection
          dbInstance.rewardService.recordCardRefund(playerId, this.config.roomId, 1);

          let desc = `Refund for Bingo Card #${cardNumber} (${this.gameId})`;
          if ((ticket.bonusPaid || 0) > 0) {
            desc += ` [Refunded: ${(ticket.bonusPaid || 0).toFixed(2)} Bonus + ${(ticket.cashPaid || 0).toFixed(2)} Cash]`;
          }

          const wallet = dbInstance.getWallet(playerId)!;
          const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          (dbInstance as any).db.prepare(`
            INSERT INTO ledger_transactions (
              id, user_id, username, type, amount, balance_before, balance_after,
              game_id, description, created_at
            ) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?, ?, ?)
          `).run(
            entryId,
            playerId,
            ticket.username,
            this.config.betPerCard,
            wallet.balance - (ticket.cashPaid || 0),
            wallet.balance,
            this.gameId,
            desc,
            new Date().toISOString()
          );
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
    const totalCatalog = this.config.totalCatalogCards || 200;
    const availableNumbers: number[] = [];
    for (let i = 1; i <= totalCatalog; i++) {
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

  public async handleClaimBingo(
    playerId: string,
    ticketId: string
  ): Promise<{ success: boolean; message: string; winnerRecord?: WinnerRecord }> {
    return await this.withLock(`claim_${this.gameId}`, async () => {
      if (this.status !== 'active' || this.winners.length > 0) {
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

      const officialDrawnBalls = this.shuffledBalls.slice(0, this.currentBallIndex);
      const verification: WinningPatternResult = verifyWinningPatterns(ticket.grid, officialDrawnBalls);

      if (!verification.hasWon) {
        return {
          success: false,
          message: `Invalid Bingo claim! No verified winning pattern found.`
        };
      }

      // Calculate Payout based on user rules:
      // 100% winner if <= 5 players/cards (0% rake)
      // 80% winner / 20% owner if > 5 players/cards
      const pool = calculatePariMutuelPool({
        betPerCard: this.config.betPerCard,
        totalCardsSold: this.tickets.size,
        houseRakePercent: this.config.rakePercent
      });

      const payoutAmount = pool.winnerPayoutAmount;
      const patternNames = Object.keys(verification.patterns);
      const patternType = verification.patternTypes.hasFullHouse
        ? 'Full House'
        : verification.patternTypes.hasLine
        ? 'Line'
        : 'Four Corners';

      const winnerRecord: WinnerRecord = {
        ticketId,
        cardNumber: ticket.cardNumber,
        playerId,
        username: ticket.username,
        patternsWon: patternNames,
        winningNumbers: verification.patterns,
        payoutAmount,
        patternType: `BINGO (${patternType})`,
        claimedAtBallIndex: this.currentBallIndex,
        isBot: ticket.isBot
      };

      this.winners.push(winnerRecord);

      // Record idempotent claim in persistent database
      dbInstance.recordBingoClaim({
        gameId: this.gameId,
        ticketId,
        userId: playerId,
        payoutAmount,
        patternType: `BINGO (${patternType})`
      });

      if (!ticket.isBot) {
        if (this.db && this.db !== databaseService) {
          const user = dbInstance.getUserById(playerId);
          if (user) {
            dbInstance.recordLedgerTransaction({
              userId: playerId,
              username: user.username,
              type: 'WIN_PAYOUT',
              amount: payoutAmount,
              description: `Bingo Winner (${patternType} - ${pool.winnerPayoutPercent}% Payout) on Card #${ticket.cardNumber} in ${this.config.roomName}`,
              gameId: this.gameId,
              ticketId,
              referenceId: `claim_${this.gameId}_${ticketId}`
            });
          }
        } else {
          await ledgerService.recordTransaction(
            playerId,
            'win_payout',
            payoutAmount,
            `Bingo Winner (${patternType} - ${pool.winnerPayoutPercent}% Payout) on Card #${ticket.cardNumber} in ${this.config.roomName}`,
            this.gameId,
            ticketId,
            `claim_${this.gameId}_${ticketId}`
          );
        }
      }

      this.io.to(`room_${this.config.roomId}`).emit('BINGO_WINNER_ANNOUNCED', {
        roomId: this.config.roomId,
        winner: winnerRecord,
        gameId: this.gameId,
        patternsWon: patternNames,
        payoutAmount,
        winnerPayoutPercent: pool.winnerPayoutPercent,
        isFivePlayerBonus: pool.isFivePlayerBonus
      });

      // RULE: The first person who hits BINGO wins, and the game ends immediately!
      this.transitionToFinished();

      return { success: true, message: `BINGO Verified! You won the ${payoutAmount.toFixed(0)} Birr prize pot!`, winnerRecord };
    });
  }

  private transitionToFinished() {
    this.clearTimers();
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

    this.io.to(`room_${this.config.roomId}`).emit('GAME_FINISHED', {
      roomId: this.config.roomId,
      gameId: this.gameId,
      winners: this.winners,
      serverSeedRevealed: this.serverSeed,
      fullShuffledBallsRevealed: this.shuffledBalls
    });

    // Auto-reset room to lobby after 10 seconds
    setTimeout(() => {
      if (this.status === 'finished') {
        this.initNewGame();
      }
    }, 10000);
  }
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
    const roomConfigs: RoomConfig[] = [
      {
        roomId: 'room_10birr',
        roomName: 'Starter Lounge',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20.0,
        lobbyDuration: 20,
        drawIntervalMs: 3200,
        totalCatalogCards: 200,
        minCardsToStart: 5,
        badge: '🔥 10 BIRR ENTRY'
      },
      {
        roomId: 'room_20birr',
        roomName: 'Bronze Room',
        betPerCard: 20,
        etbEquivalent: 20,
        rakePercent: 20.0,
        lobbyDuration: 22,
        drawIntervalMs: 3200,
        totalCatalogCards: 200,
        minCardsToStart: 5,
        badge: '⭐ 20 BIRR'
      },
      {
        roomId: 'room_50birr',
        roomName: 'Gold Arena',
        betPerCard: 50,
        etbEquivalent: 50,
        rakePercent: 20.0,
        lobbyDuration: 25,
        drawIntervalMs: 3000,
        totalCatalogCards: 200,
        minCardsToStart: 5,
        badge: '💎 50 BIRR POPULAR'
      },
      {
        roomId: 'room_100birr',
        roomName: 'Diamond High-Roller',
        betPerCard: 100,
        etbEquivalent: 100,
        rakePercent: 20.0,
        lobbyDuration: 30,
        drawIntervalMs: 2800,
        totalCatalogCards: 200,
        minCardsToStart: 5,
        badge: '👑 100 BIRR MAX VIP'
      }
    ];

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
