import { databaseService, DatabaseService } from './DatabaseService.js';

export interface LeaderboardWinner {
  rank: number;
  userId: string;
  name: string;
  avatar?: string;
  totalWon: number;
  wins: number;
  gamesPlayed: number;
  level: number;
  xp: number;
  badge?: string;
}

export interface RecentJackpot {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  amountETB: number;
  pattern: string;
  room: string;
  time: string;
  winType: 'BINGO' | 'DAILY_JACKPOT';
}

export interface CurrentUserRankStats {
  rank: number | null; // null if UNRANKED
  totalWonETB: number;
  totalWins: number;
  gamesPlayed: number;
  level: number;
  xp: number;
  isRanked: boolean;
}

export interface LeaderboardResponse {
  topWinners: LeaderboardWinner[];
  recentJackpots: RecentJackpot[];
  currentUserRank?: CurrentUserRankStats;
}

export class LeaderboardService {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService = databaseService) {
    this.dbService = dbService;
  }

  /**
   * Helper to format room name safely
   */
  private formatRoomName(roomId: string): string {
    if (!roomId) return 'Standard Room';
    const clean = roomId.replace(/^room_/, '').toUpperCase();
    return `${clean} ROOM`;
  }

  /**
   * Calculates XP and Level canonically across the platform
   */
  public calculateLevel(totalGames: number, totalWon: number, totalWins: number): { xp: number; level: number } {
    const xp = Math.floor(totalGames * 20 + Math.floor(totalWon / 5) + totalWins * 50);
    const xpPerLevel = 500;
    const level = Math.floor(xp / xpPerLevel) + 1;
    return { xp, level };
  }

  /**
   * Get top verified winners ordered by total won ETB DESC, total wins DESC, creation ASC
   * Excludes bots, guests, test fixtures, and banned users
   */
  public getTopWinners(limit: number = 50): LeaderboardWinner[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

    const sql = `
      WITH user_bingo_wins AS (
        SELECT 
          bc.user_id,
          COUNT(bc.id) as bingo_wins,
          SUM(bc.payout_amount) as bingo_payout
        FROM bingo_claims bc
        JOIN games g ON g.id = bc.game_id
        WHERE bc.status = 'VERIFIED'
          AND g.status = 'finished'
        GROUP BY bc.user_id
      ),
      user_jackpot_wins AS (
        SELECT
          winner_user_id as user_id,
          COUNT(id) as jackpot_wins,
          SUM(jackpot_amount) as jackpot_payout
        FROM daily_jackpot_rounds
        WHERE status = 'COMPLETED'
          AND payout_status = 'PAID'
          AND winner_user_id IS NOT NULL
        GROUP BY winner_user_id
      ),
      user_games_played AS (
        SELECT
          user_id,
          COUNT(DISTINCT game_id) as games_played
        FROM player_tickets
        GROUP BY user_id
      )
      SELECT 
        u.id as user_id,
        u.username,
        u.avatar_url,
        COALESCE(bw.bingo_wins, 0) + COALESCE(jw.jackpot_wins, 0) as total_wins,
        ROUND(COALESCE(bw.bingo_payout, 0) + COALESCE(jw.jackpot_payout, 0), 2) as total_won_etb,
        COALESCE(gp.games_played, 0) as games_played,
        u.created_at
      FROM users u
      LEFT JOIN user_bingo_wins bw ON bw.user_id = u.id
      LEFT JOIN user_jackpot_wins jw ON jw.user_id = u.id
      LEFT JOIN user_games_played gp ON gp.user_id = u.id
      WHERE (COALESCE(bw.bingo_wins, 0) + COALESCE(jw.jackpot_wins, 0)) > 0
        AND u.is_bot = 0
        AND u.account_status != 'BANNED'
        AND (u.account_type IS NULL OR u.account_type = 'REAL' OR u.account_type = 'ADMIN')
      ORDER BY total_won_etb DESC, total_wins DESC, u.created_at ASC
      LIMIT ?
    `;

    const rows = this.dbService.getDb().prepare(sql).all(safeLimit) as Array<{
      user_id: string;
      username: string;
      avatar_url?: string;
      total_wins: number;
      total_won_etb: number;
      games_played: number;
      created_at: string;
    }>;

    return rows.map((r, index) => {
      const { xp, level } = this.calculateLevel(r.games_played, r.total_won_etb, r.total_wins);
      let badge: string | undefined = undefined;
      if (index === 0) badge = 'CHAMPION';
      else if (index === 1) badge = 'RUNNER UP';
      else if (index === 2) badge = '3RD PLACE';
      else if (level >= 10) badge = 'HIGH ROLLER';

      return {
        rank: index + 1,
        userId: r.user_id,
        name: r.username,
        avatar: r.avatar_url || undefined,
        totalWon: r.total_won_etb,
        wins: r.total_wins,
        gamesPlayed: r.games_played,
        level,
        xp,
        badge
      };
    });
  }

  /**
   * Get recent verified jackpot & winning events from authoritative database records
   */
  public getRecentJackpots(limit: number = 30): RecentJackpot[] {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

    const sql = `
      SELECT 
        'BINGO' as win_type,
        bc.id as win_id,
        u.id as user_id,
        u.username,
        u.avatar_url,
        ROUND(bc.payout_amount, 2) as amount_etb,
        bc.pattern_type as pattern,
        COALESCE(g.room_id, 'Standard Room') as room_id,
        bc.claimed_at as won_at
      FROM bingo_claims bc
      JOIN games g ON g.id = bc.game_id
      JOIN users u ON u.id = bc.user_id
      WHERE bc.status = 'VERIFIED'
        AND g.status = 'finished'
        AND u.is_bot = 0
        AND u.account_status != 'BANNED'
        AND (u.account_type IS NULL OR u.account_type = 'REAL' OR u.account_type = 'ADMIN')

      UNION ALL

      SELECT 
        'DAILY_JACKPOT' as win_type,
        djr.id as win_id,
        u.id as user_id,
        djr.winner_username as username,
        u.avatar_url,
        ROUND(djr.jackpot_amount, 2) as amount_etb,
        'DAILY GRAND JACKPOT' as pattern,
        'Daily Grand Jackpot' as room_id,
        COALESCE(djr.paid_at, djr.updated_at) as won_at
      FROM daily_jackpot_rounds djr
      JOIN users u ON u.id = djr.winner_user_id
      WHERE djr.status = 'COMPLETED'
        AND djr.payout_status = 'PAID'
        AND djr.winner_user_id IS NOT NULL
        AND u.is_bot = 0
        AND u.account_status != 'BANNED'
        AND (u.account_type IS NULL OR u.account_type = 'REAL' OR u.account_type = 'ADMIN')

      ORDER BY won_at DESC
      LIMIT ?
    `;

    const rows = this.dbService.getDb().prepare(sql).all(safeLimit) as Array<{
      win_type: 'BINGO' | 'DAILY_JACKPOT';
      win_id: string;
      user_id: string;
      username: string;
      avatar_url?: string;
      amount_etb: number;
      pattern: string;
      room_id: string;
      won_at: string;
    }>;

    return rows.map(r => ({
      id: r.win_id,
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar_url || undefined,
      amountETB: r.amount_etb,
      pattern: r.pattern || 'BINGO',
      room: r.win_type === 'DAILY_JACKPOT' ? 'Daily Grand Jackpot' : this.formatRoomName(r.room_id),
      time: r.won_at,
      winType: r.win_type
    }));
  }

  /**
   * Authoritatively calculates rank and personal statistics for a given user
   */
  public getUserRankAndStats(userId: string): CurrentUserRankStats | null {
    if (!userId) return null;

    const user = this.dbService.getUserById(userId);
    if (!user) return null;

    // Check if user has rank among ranked population
    const rankSql = `
      WITH ranked_users AS (
        SELECT 
          u.id as user_id,
          ROUND(COALESCE(bw.bingo_payout, 0) + COALESCE(jw.jackpot_payout, 0), 2) as total_won_etb,
          COALESCE(bw.bingo_wins, 0) + COALESCE(jw.jackpot_wins, 0) as total_wins,
          COALESCE(gp.games_played, 0) as games_played,
          ROW_NUMBER() OVER (
            ORDER BY (COALESCE(bw.bingo_payout, 0) + COALESCE(jw.jackpot_payout, 0)) DESC,
                     (COALESCE(bw.bingo_wins, 0) + COALESCE(jw.jackpot_wins, 0)) DESC,
                     u.created_at ASC
          ) as rank
        FROM users u
        LEFT JOIN (
          SELECT bc.user_id, COUNT(bc.id) as bingo_wins, SUM(bc.payout_amount) as bingo_payout
          FROM bingo_claims bc
          JOIN games g ON g.id = bc.game_id
          WHERE bc.status = 'VERIFIED' AND g.status = 'finished'
          GROUP BY bc.user_id
        ) bw ON bw.user_id = u.id
        LEFT JOIN (
          SELECT winner_user_id as user_id, COUNT(id) as jackpot_wins, SUM(jackpot_amount) as jackpot_payout
          FROM daily_jackpot_rounds
          WHERE status = 'COMPLETED' AND payout_status = 'PAID' AND winner_user_id IS NOT NULL
          GROUP BY winner_user_id
        ) jw ON jw.user_id = u.id
        LEFT JOIN (
          SELECT user_id, COUNT(DISTINCT game_id) as games_played
          FROM player_tickets
          GROUP BY user_id
        ) gp ON gp.user_id = u.id
        WHERE (COALESCE(bw.bingo_wins, 0) + COALESCE(jw.jackpot_wins, 0)) > 0
          AND u.is_bot = 0
          AND u.account_status != 'BANNED'
          AND (u.account_type IS NULL OR u.account_type = 'REAL' OR u.account_type = 'ADMIN')
      )
      SELECT * FROM ranked_users WHERE user_id = ?
    `;

    const rankedRow = this.dbService.getDb().prepare(rankSql).get(userId) as {
      user_id: string;
      total_won_etb: number;
      total_wins: number;
      games_played: number;
      rank: number;
    } | undefined;

    if (rankedRow) {
      const { xp, level } = this.calculateLevel(rankedRow.games_played, rankedRow.total_won_etb, rankedRow.total_wins);
      return {
        rank: Number(rankedRow.rank),
        totalWonETB: rankedRow.total_won_etb,
        totalWins: rankedRow.total_wins,
        gamesPlayed: rankedRow.games_played,
        level,
        xp,
        isRanked: true
      };
    }

    // User is UNRANKED (no verified wins yet or bot/banned)
    // Calculate actual games played
    const gamesPlayedRow = this.dbService.getDb().prepare(`
      SELECT COUNT(DISTINCT game_id) as games_played FROM player_tickets WHERE user_id = ?
    `).get(userId) as { games_played: number } | undefined;

    const gamesPlayed = gamesPlayedRow?.games_played || 0;
    const { xp, level } = this.calculateLevel(gamesPlayed, 0, 0);

    return {
      rank: null,
      totalWonETB: 0,
      totalWins: 0,
      gamesPlayed,
      level,
      xp,
      isRanked: false
    };
  }

  /**
   * Combined endpoint response for leaderboard and Hall of Fame
   */
  public getLeaderboardData(currentUserId?: string, limit: number = 50): LeaderboardResponse {
    const topWinners = this.getTopWinners(limit);
    const recentJackpots = this.getRecentJackpots(limit);
    const currentUserRank = currentUserId ? this.getUserRankAndStats(currentUserId) || undefined : undefined;

    return {
      topWinners,
      recentJackpots,
      currentUserRank
    };
  }
}

export const leaderboardService = new LeaderboardService();
