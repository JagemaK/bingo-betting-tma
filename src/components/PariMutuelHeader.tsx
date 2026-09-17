import React from 'react';
import { Trophy, Users, Ticket, Flame } from 'lucide-react';
import { GameRoomState, CurrencyType } from '../types/bingo.js';

interface PariMutuelHeaderProps {
  gameState: GameRoomState;
  onSelectBetTier?: (tier: number) => void;
  userCardCount: number;
  currency?: CurrencyType;
}

export const PariMutuelHeader: React.FC<PariMutuelHeaderProps> = ({
  gameState,
  userCardCount: _userCardCount,
  currency: _currency = 'ETB'
}) => {
  const {
    totalPot,
    playerPayoutPool,
    winnerPayoutAmount,
    winnerPayoutPercent,
    isFivePlayerBonus,
    activePlayersCount,
    totalCardsSold,
    minCardsToStart = 5
  } = gameState;

  const winnerAmount = winnerPayoutAmount || playerPayoutPool || totalPot * 0.8;
  const winnerPct = winnerPayoutPercent || (isFivePlayerBonus ? 100 : 80);
  const houseRakePct = isFivePlayerBonus ? 0 : 20;
  const houseRakeAmt = Number(((totalPot * houseRakePct) / 100).toFixed(2));

  const formatCurrency = (val: number) => `${((val ?? 0)).toLocaleString()} Birr`;
  const isReady = totalCardsSold >= minCardsToStart;

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border transition-all duration-300 shadow-[0_8px_24px_rgba(0,0,0,0.7)] ${
        isFivePlayerBonus
          ? 'bg-[#14160a] border-[#E8FF00]/50 shadow-[0_0_24px_rgba(232,255,0,0.2)]'
          : 'bg-[#121212] border-white/10'
      }`}
    >
      {/* Laser line highlight */}
      <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-[#E8FF00]/40 to-transparent pointer-events-none" />

      {/* 5-Player Special Promo Banner */}
      {isFivePlayerBonus && totalCardsSold > 0 && (
        <div className="relative z-10 px-4 py-1.5 flex items-center justify-between bg-[#E8FF00]/15 border-b border-[#E8FF00]/30">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[#E8FF00] fill-current animate-pulse" />
            <span className="font-arcade font-black text-xs text-[#E8FF00] tracking-wider uppercase">
              5-Player Special · 100% Winner Pot!
            </span>
          </div>
          <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-[#E8FF00] text-black">
            BONUS
          </span>
        </div>
      )}

      {/* Main Prize Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-3">
          {/* Trophy Frame */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-[#16180a] border border-[#E8FF00]/40 shadow-[0_0_16px_rgba(232,255,0,0.25)]">
            <Trophy className="w-6 h-6 text-[#E8FF00]" />
          </div>

          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="font-arcade font-extrabold text-[10px] tracking-wider uppercase text-white/50">
                1st Bingo Prize ({winnerPct}%)
              </span>
            </div>
            {/* Prize Amount */}
            <div className="font-arcade font-black text-2xl leading-none text-[#E8FF00] tracking-tight drop-shadow-[0_0_12px_rgba(232,255,0,0.4)]">
              {formatCurrency(winnerAmount)}
            </div>
          </div>
        </div>

        {/* Player & Card Counter Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-arcade font-bold bg-[#161616] border border-white/10 text-white/80">
            <Users className="w-3 h-3 text-[#E8FF00]" />
            <span>{activePlayersCount}P</span>
          </div>
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-arcade font-bold border ${
              isReady
                ? 'bg-[#E8FF00]/15 text-[#E8FF00] border-[#E8FF00]/40'
                : 'bg-[#161616] text-white/60 border-white/10'
            }`}
          >
            <Ticket className="w-3 h-3" />
            <span>{totalCardsSold}/{minCardsToStart}</span>
          </div>
        </div>
      </div>

      {/* 3-Column Stat Strip */}
      <div className="relative z-10 grid grid-cols-3 gap-2 px-4 pb-3">
        {/* Total Pool */}
        <div className="rounded-xl p-2 text-center bg-[#161616] border border-white/5">
          <div className="font-arcade text-[9px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
            Total Pool
          </div>
          <div className="font-arcade text-xs font-black text-white">
            {formatCurrency(totalPot)}
          </div>
        </div>

        {/* Winner Share */}
        <div className="rounded-xl p-2 text-center bg-[#E8FF00]/[0.08] border border-[#E8FF00]/20">
          <div className="font-arcade text-[9px] font-bold uppercase tracking-wider text-[#E8FF00] mb-0.5">
            Winner ({winnerPct}%)
          </div>
          <div className="font-arcade text-xs font-black text-[#E8FF00]">
            {formatCurrency(winnerAmount)}
          </div>
        </div>

        {/* House Takeout */}
        <div className="rounded-xl p-2 text-center bg-[#161616] border border-white/5">
          <div className="font-arcade text-[9px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
            Rake ({houseRakePct}%)
          </div>
          <div className="font-arcade text-xs font-semibold text-white/40">
            {formatCurrency(houseRakeAmt)}
          </div>
        </div>
      </div>
    </div>
  );
};
