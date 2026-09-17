import React, { useState, useEffect } from 'react';
import { Trophy, Crown, Sparkles, X, Flame, Medal, ArrowLeft, ArrowRight } from 'lucide-react';
import { LeaderboardWinner, RecentJackpot, CurrencyType } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { apiUrl } from '../config/api.js';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: CurrencyType;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [winners, setWinners] = useState<LeaderboardWinner[]>([]);
  const [jackpots, setJackpots] = useState<RecentJackpot[]>([]);
  const [tab, setTab] = useState<'daily' | 'jackpots'>('daily');

  useEffect(() => {
    if (isOpen) {
      fetch(apiUrl('/api/leaderboard'))
        .then((res) => res.json())
        .then((data) => {
          setWinners(data.topWinners || []);
          setJackpots(data.recentJackpots || []);
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatAmount = (_usd: number, etb: number) => {
    return `${((etb ?? 0)).toLocaleString()} Birr`;
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
        <header className="relative z-20 w-full px-5 py-3.5 bg-[#161616]/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundService.playClick();
                onClose();
              }}
              className="w-8 h-8 rounded-xl bg-[#202020] hover:bg-[#282828] text-white/80 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Back to Game"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="font-arcade font-black text-base text-white uppercase tracking-wider">
                HALL OF FAME
              </span>
              <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-[#E8FF00] text-black uppercase">
                TOP WINNERS
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#282828] text-white/60 hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95"
            title="Close Leaderboard"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#141414] border border-white/10">
          <button
            onClick={() => {
              soundService.playClick();
              setTab('daily');
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase ${
              tab === 'daily'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>TOP PLAYERS</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setTab('jackpots');
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase ${
              tab === 'jackpots'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>RECENT JACKPOTS</span>
          </button>
        </div>

        {/* Tab 1: Top Winners */}
        {tab === 'daily' && (
          <div className="space-y-4">
            {/* Top 3 Podium Cards */}
            {top1 && (
              <div className="grid grid-cols-3 gap-2 items-end pt-2">
                {/* Rank 2 (Silver) */}
                {top2 && (
                  <div className="p-3 rounded-2xl bg-[#141414] border border-slate-400/40 text-center space-y-1.5 order-1">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-slate-300 text-black flex items-center justify-center font-arcade font-black text-sm shadow-md">
                      2
                    </div>
                    <div>
                      <div className="font-arcade font-black text-xs text-white truncate">{top2.username}</div>
                      <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-white/10 text-slate-300 block truncate">
                        {top2.badge}
                      </span>
                    </div>
                    <div className="font-arcade font-black text-xs text-[#E8FF00]">
                      +{formatAmount(top2.totalWonUSD, top2.totalWonETB)}
                    </div>
                    <div className="text-[8px] font-arcade text-white/40">5,000 B PRIZE</div>
                  </div>
                )}

                {/* Rank 1 (Gold / Neon Hero) */}
                <div className="p-3.5 rounded-2xl bg-[#181818] border-2 border-[#E8FF00] shadow-[0_0_20px_rgba(232,255,0,0.25)] text-center space-y-1.5 order-2 -translate-y-2">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#E8FF00] text-black flex items-center justify-center font-arcade font-black text-lg shadow-lg">
                    👑 1
                  </div>
                  <div>
                    <div className="font-arcade font-black text-sm text-white truncate">{top1.username}</div>
                    <span className="text-[8px] font-arcade font-black px-1.5 py-0.2 rounded bg-[#E8FF00]/20 text-[#E8FF00] border border-[#E8FF00]/40 inline-block">
                      🏆 {top1.badge}
                    </span>
                  </div>
                  <div className="font-arcade font-black text-sm text-[#E8FF00] drop-shadow-[0_0_8px_rgba(232,255,0,0.5)]">
                    +{formatAmount(top1.totalWonUSD, top1.totalWonETB)}
                  </div>
                  <div className="text-[9px] font-arcade font-bold text-[#E8FF00]">10,000 B PRIZE</div>
                </div>

                {/* Rank 3 (Bronze) */}
                {top3 && (
                  <div className="p-3 rounded-2xl bg-[#141414] border border-amber-700/40 text-center space-y-1.5 order-3">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-[#cd7f32] text-white flex items-center justify-center font-arcade font-black text-sm shadow-md">
                      3
                    </div>
                    <div>
                      <div className="font-arcade font-black text-xs text-white truncate">{top3.username}</div>
                      <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-white/10 text-amber-300 block truncate">
                        {top3.badge}
                      </span>
                    </div>
                    <div className="font-arcade font-black text-xs text-[#E8FF00]">
                      +{formatAmount(top3.totalWonUSD, top3.totalWonETB)}
                    </div>
                    <div className="text-[8px] font-arcade text-white/40">2,500 B PRIZE</div>
                  </div>
                )}
              </div>
            )}

            {/* List of All Winners */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                ALL TIME LEADERBOARD
              </span>

              {winners.map((winner) => (
                <div
                  key={winner.rank}
                  className="p-3 rounded-2xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-arcade font-black text-xs ${
                      winner.rank === 1
                        ? 'bg-[#E8FF00] text-black shadow-md'
                        : winner.rank === 2
                        ? 'bg-slate-300 text-black'
                        : winner.rank === 3
                        ? 'bg-[#cd7f32] text-white'
                        : 'bg-[#1c1c1c] text-white/60 border border-white/5'
                    }`}>
                      #{winner.rank}
                    </div>
                    <div>
                      <div className="font-arcade font-black text-xs text-white flex items-center gap-1.5">
                        <span>{winner.username}</span>
                        <span className="text-[8px] font-arcade px-1.5 py-0.2 rounded bg-white/5 text-white/40">
                          {winner.badge}
                        </span>
                      </div>
                      <div className="text-[10px] font-arcade text-white/40 mt-0.5">
                        {winner.gamesPlayed} games played
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-arcade font-black text-sm text-[#E8FF00]">
                      +{formatAmount(winner.totalWonUSD, winner.totalWonETB)}
                    </div>
                    <div className="text-[8px] font-arcade text-white/40 uppercase">Total Won</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Recent Jackpots */}
        {tab === 'jackpots' && (
          <div className="space-y-2.5">
            <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
              LIVE RECENT JACKPOT WINS
            </span>

            {jackpots.map((jp, i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00] flex-shrink-0">
                    <Flame className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <div className="font-arcade font-black text-xs text-white">
                      <strong>{jp.username}</strong> hit <span className="text-[#E8FF00]">{jp.pattern}</span>
                    </div>
                    <div className="text-[10px] font-arcade text-white/40 mt-0.5">
                      {jp.room} • {jp.timeAgo}
                    </div>
                  </div>
                </div>

                <div className="font-arcade font-black text-sm text-[#E8FF00] text-right whitespace-nowrap">
                  +{formatAmount(jp.amountUSD, jp.amountETB)}
                </div>
              </div>
            ))}
          </div>
        )}
        </main>

        {/* Pinned User Rank Bar */}
        <div className="p-3.5 bg-[#161616] border-t-2 border-[#E8FF00]/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E8FF00] text-black font-arcade font-black text-xs flex items-center justify-center">
              #14
            </div>
            <div>
              <div className="font-arcade font-black text-xs text-white">YOUR RANK: #14</div>
              <div className="text-[10px] font-arcade text-[#E8FF00]">840 BIRR WON • LEVEL 4</div>
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
