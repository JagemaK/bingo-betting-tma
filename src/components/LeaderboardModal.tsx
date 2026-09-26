import React, { useState, useEffect } from 'react';
import { Trophy, Crown, Sparkles, Flame, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { LeaderboardWinner, RecentJackpot, CurrentUserRankStats, CurrencyType } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { apiUrl } from '../config/api.js';
import { ModalHeader } from './ModalHeader.js';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: CurrencyType;
}

function formatTimeAgo(timeStr?: string): string {
  if (!timeStr) return 'Recent';
  const date = new Date(timeStr);
  const diffMs = Date.now() - date.getTime();
  if (isNaN(diffMs)) return timeStr;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [winners, setWinners] = useState<LeaderboardWinner[]>([]);
  const [jackpots, setJackpots] = useState<RecentJackpot[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<CurrentUserRankStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'daily' | 'jackpots'>('daily');

  const fetchLeaderboardData = () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('session_token') || localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(apiUrl('/api/leaderboard'), { headers })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load leaderboard (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setWinners(data.topWinners || []);
        setJackpots(data.recentJackpots || []);
        setCurrentUserRank(data.currentUserRank || null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[LeaderboardModal] Error loading leaderboard:', err);
        setError('Unable to load authoritative ranking data. Please try again.');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboardData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatAmount = (etb: number) => {
    return `${(etb ?? 0).toLocaleString()} Birr`;
  };

  const top1 = winners.find((w) => w.rank === 1);
  const top2 = winners.find((w) => w.rank === 2);
  const top3 = winners.find((w) => w.rank === 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="HALL OF FAME"
          badge="AUTHORITATIVE RANKS"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Leaderboard"
        />

        {/* Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 w-full">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#141414] border border-white/10">
            <button
              onClick={() => {
                soundService.playClick();
                setTab('daily');
              }}
              className={`py-2 px-1 text-[11px] sm:text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase whitespace-nowrap min-w-0 ${
                tab === 'daily'
                  ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Crown className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate whitespace-nowrap">TOP PLAYERS</span>
            </button>

            <button
              onClick={() => {
                soundService.playClick();
                setTab('jackpots');
              }}
              className={`py-2 px-1 text-[11px] sm:text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase whitespace-nowrap min-w-0 ${
                tab === 'jackpots'
                  ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate whitespace-nowrap">RECENT JACKPOTS</span>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-16 text-center space-y-3 font-arcade">
              <RefreshCw className="w-8 h-8 mx-auto text-[#E8FF00] animate-spin" />
              <div className="text-xs text-white/70 font-bold uppercase tracking-wider">
                Verifying Authoritative Outcomes...
              </div>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="py-12 px-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-center space-y-3 font-arcade">
              <AlertCircle className="w-8 h-8 mx-auto text-red-400" />
              <div className="text-xs text-red-200 font-bold">{error}</div>
              <button
                onClick={fetchLeaderboardData}
                className="px-4 py-1.5 rounded-lg bg-red-500 text-white font-black text-[11px] hover:bg-red-400 transition-colors uppercase cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Tab 1: Top Winners */}
          {!loading && !error && tab === 'daily' && (
            <div className="space-y-4">
              {winners.length === 0 ? (
                <div className="py-16 text-center space-y-3 font-arcade rounded-2xl bg-[#141414] border border-white/5 p-6">
                  <Trophy className="w-12 h-12 mx-auto text-white/20" />
                  <div className="text-sm font-black text-white/70 uppercase">NO VERIFIED WINNERS YET</div>
                  <div className="text-[10px] text-white/40 max-w-xs mx-auto">
                    Play in any bingo room and be the first champion to top the Hall of Fame!
                  </div>
                </div>
              ) : (
                <>
                  {/* Top 3 Podium Cards */}
                  {top1 && (
                    <div className="grid grid-cols-3 gap-2 items-end pt-2">
                      {/* Rank 2 (Silver) */}
                      {top2 ? (
                        <div className="p-3 rounded-2xl bg-[#141414] border border-slate-400/40 text-center space-y-1.5 order-1">
                          <div className="w-10 h-10 mx-auto rounded-xl bg-slate-300 text-black flex items-center justify-center font-arcade font-black text-sm shadow-md">
                            2
                          </div>
                          <div>
                            <div className="font-arcade font-black text-xs text-white truncate">
                              {top2.name || top2.username}
                            </div>
                            <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-white/10 text-slate-300 block truncate">
                              {top2.badge || `LVL ${top2.level || 1}`}
                            </span>
                          </div>
                          <div className="font-arcade font-black text-xs text-[#E8FF00]">
                            +{formatAmount(top2.totalWon || top2.totalWonETB)}
                          </div>
                          <div className="text-[8px] font-arcade text-white/40 uppercase">
                            {top2.wins || 0} WINS
                          </div>
                        </div>
                      ) : (
                        <div className="order-1" />
                      )}

                      {/* Rank 1 (Gold / Neon Hero) */}
                      <div className="p-3.5 rounded-2xl bg-[#181818] border-2 border-[#E8FF00] shadow-[0_0_20px_rgba(232,255,0,0.25)] text-center space-y-1.5 order-2 -translate-y-2">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#E8FF00] text-black flex items-center justify-center font-arcade font-black text-lg shadow-lg">
                          👑 1
                        </div>
                        <div>
                          <div className="font-arcade font-black text-sm text-white truncate">
                            {top1.name || top1.username}
                          </div>
                          <span className="text-[8px] font-arcade font-black px-1.5 py-0.2 rounded bg-[#E8FF00]/20 text-[#E8FF00] border border-[#E8FF00]/40 inline-block">
                            🏆 {top1.badge || 'CHAMPION'}
                          </span>
                        </div>
                        <div className="font-arcade font-black text-sm text-[#E8FF00] drop-shadow-[0_0_8px_rgba(232,255,0,0.5)]">
                          +{formatAmount(top1.totalWon || top1.totalWonETB)}
                        </div>
                        <div className="text-[9px] font-arcade font-bold text-[#E8FF00] uppercase">
                          {top1.wins || 0} VERIFIED WINS
                        </div>
                      </div>

                      {/* Rank 3 (Bronze) */}
                      {top3 ? (
                        <div className="p-3 rounded-2xl bg-[#141414] border border-amber-700/40 text-center space-y-1.5 order-3">
                          <div className="w-10 h-10 mx-auto rounded-xl bg-[#cd7f32] text-white flex items-center justify-center font-arcade font-black text-sm shadow-md">
                            3
                          </div>
                          <div>
                            <div className="font-arcade font-black text-xs text-white truncate">
                              {top3.name || top3.username}
                            </div>
                            <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-white/10 text-amber-300 block truncate">
                              {top3.badge || `LVL ${top3.level || 1}`}
                            </span>
                          </div>
                          <div className="font-arcade font-black text-xs text-[#E8FF00]">
                            +{formatAmount(top3.totalWon || top3.totalWonETB)}
                          </div>
                          <div className="text-[8px] font-arcade text-white/40 uppercase">
                            {top3.wins || 0} WINS
                          </div>
                        </div>
                      ) : (
                        <div className="order-3" />
                      )}
                    </div>
                  )}

                  {/* List of All Ranked Winners */}
                  <div className="space-y-2 pt-2">
                    <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                      ALL TIME VERIFIED LEADERBOARD
                    </span>

                    {winners.map((winner) => (
                      <div
                        key={winner.userId || winner.rank}
                        className="p-3 rounded-2xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-arcade font-black text-xs ${
                              winner.rank === 1
                                ? 'bg-[#E8FF00] text-black shadow-md'
                                : winner.rank === 2
                                ? 'bg-slate-300 text-black'
                                : winner.rank === 3
                                ? 'bg-[#cd7f32] text-white'
                                : 'bg-[#1c1c1c] text-white/60 border border-white/5'
                            }`}
                          >
                            #{winner.rank}
                          </div>
                          <div>
                            <div className="font-arcade font-black text-xs text-white flex items-center gap-1.5">
                              <span>{winner.name || winner.username}</span>
                              {winner.badge && (
                                <span className="text-[8px] font-arcade px-1.5 py-0.2 rounded bg-white/5 text-white/40">
                                  {winner.badge}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-arcade text-white/40 mt-0.5">
                              {winner.wins || 0} wins • {winner.gamesPlayed} games • Lvl {winner.level || 1}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-arcade font-black text-sm text-[#E8FF00]">
                            +{formatAmount(winner.totalWon || winner.totalWonETB)}
                          </div>
                          <div className="text-[8px] font-arcade text-white/40 uppercase">Total Won</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 2: Recent Jackpots */}
          {!loading && !error && tab === 'jackpots' && (
            <div className="space-y-2.5">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                AUTHORITATIVE WIN EVENTS
              </span>

              {jackpots.length === 0 ? (
                <div className="py-16 text-center space-y-3 font-arcade rounded-2xl bg-[#141414] border border-white/5 p-6">
                  <Sparkles className="w-12 h-12 mx-auto text-white/20" />
                  <div className="text-sm font-black text-white/70 uppercase">NO RECENT JACKPOT WINS</div>
                  <div className="text-[10px] text-white/40 max-w-xs mx-auto">
                    Verified game payouts and Weekend Jackpot victories will appear here automatically.
                  </div>
                </div>
              ) : (
                jackpots.map((jp, i) => (
                  <div
                    key={jp.id || i}
                    className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00] flex-shrink-0">
                        <Flame className="w-5 h-5 fill-current" />
                      </div>
                      <div>
                        <div className="font-arcade font-black text-xs text-white">
                          <strong>{jp.username}</strong> won with{' '}
                          <span className="text-[#E8FF00]">{jp.pattern}</span>
                        </div>
                        <div className="text-[10px] font-arcade text-white/40 mt-0.5">
                          {jp.room} • {formatTimeAgo(jp.time || jp.timeAgo)}
                        </div>
                      </div>
                    </div>

                    <div className="font-arcade font-black text-sm text-[#E8FF00] text-right whitespace-nowrap">
                      +{formatAmount(jp.amountETB)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </main>

        {/* Dynamic Pinned User Rank Bar */}
        <div className="p-3.5 bg-[#161616] border-t-2 border-[#E8FF00]/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl font-arcade font-black text-xs flex items-center justify-center ${
                currentUserRank?.isRanked
                  ? 'bg-[#E8FF00] text-black shadow-md'
                  : 'bg-white/10 text-white/50 border border-white/10'
              }`}
            >
              {currentUserRank?.isRanked ? `#${currentUserRank.rank}` : '-'}
            </div>
            <div>
              <div className="font-arcade font-black text-xs text-white">
                {currentUserRank?.isRanked
                  ? `YOUR RANK: #${currentUserRank.rank}`
                  : 'YOUR RANK: UNRANKED'}
              </div>
              <div className="text-[10px] font-arcade text-[#E8FF00]">
                {currentUserRank?.isRanked
                  ? `${(currentUserRank.totalWonETB || 0).toLocaleString()} BIRR WON • LEVEL ${currentUserRank.level || 1}`
                  : `${currentUserRank ? `${currentUserRank.gamesPlayed || 0} GAMES PLAYED • LEVEL ${currentUserRank.level || 1}` : '0 BIRR WON • PLAY TO RANK'}`}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-neon px-4 py-2 text-xs font-arcade font-black uppercase rounded-xl flex items-center gap-1 cursor-pointer"
          >
            <span>PLAY NOW</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
