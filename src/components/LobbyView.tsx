import React, { useState } from 'react';
import {
  Clock,
  ArrowRight,
  Flame,
  Zap,
  Gift,
  Users,
  Play,
  RotateCw,
  Trophy,
} from 'lucide-react';
import { RoomSummary, CurrencyType, UserAccount, DailyJackpotPublicState } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { TopHeader } from './TopHeader.js';
import { BottomNavDock } from './BottomNavDock.js';
import { BettingDescriptionSection } from './BettingDescriptionSection.js';

interface LobbyViewProps {
  rooms: RoomSummary[];
  user: UserAccount | null;
  currency?: CurrencyType;
  onSelectCurrency?: (c: CurrencyType) => void;
  onJoinRoom: (roomId: string) => void;
  onOpenDailyJackpot?: () => void;
  dailyJackpotState?: DailyJackpotPublicState | null;
  onOpenWallet: () => void;
  onOpenLeaderboard: () => void;
  onOpenReferral: () => void;
  onOpenContact: () => void;
  onOpenRules: () => void;
  onOpenProvablyFair?: () => void;
  onOpenSignUp?: () => void;
  onOpenLogin?: () => void;
  onOpenProfile?: () => void;
  onOpenMenu?: () => void;
  onOpenAdmin?: () => void;
  onRefresh: () => void;
}

type FilterTab = 'all' | 'low' | 'high' | 'fast';

export const LobbyView: React.FC<LobbyViewProps> = ({
  rooms,
  user,
  onJoinRoom,
  onOpenDailyJackpot,
  dailyJackpotState,
  onOpenWallet,
  onOpenLeaderboard,
  onOpenReferral,
  onOpenRules,
  onOpenProvablyFair,
  onOpenSignUp,
  onOpenLogin,
  onOpenProfile,
  onOpenMenu,
  onOpenAdmin,
  onRefresh,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const formatCurrency = (val: number) => `${((val ?? 0)).toLocaleString()} Birr`;

  // Find featured or highest pool room for hero
  const highestRoom = [...rooms].sort((a, b) => (b.totalPot || 0) - (a.totalPot || 0))[0] || rooms[0];

  // Filtering rooms
  const filteredRooms = rooms.filter((r) => {
    if (activeFilter === 'low') return r.etbEquivalent <= 20;
    if (activeFilter === 'high') return r.etbEquivalent >= 50;
    if (activeFilter === 'fast') return r.isCountdownActive || r.status === 'active';
    return true;
  });

  const filterTabs: Array<{ id: FilterTab; label: string }> = [
    { id: 'all', label: 'ALL ROOMS' },
    { id: 'fast', label: '⚡ FAST PLAY' },
    { id: 'low', label: '10-20 BIRR' },
    { id: 'high', label: '50-100+ BIRR' },
  ];

  return (
    <div className="w-full min-h-screen bg-[#080808] text-white flex flex-col relative overflow-x-hidden pb-28 select-none">
      {/* Subtle top laser background aura */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-[#E8FF00]/[0.04] blur-[80px] pointer-events-none" />

      {/* Top Header */}
      <TopHeader
        mode="lobby"
        user={user}
        onOpenWallet={onOpenWallet}
        onOpenRules={onOpenRules}
        onOpenProvablyFair={onOpenProvablyFair}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenReferral={onOpenReferral}
        onOpenSignUp={onOpenSignUp}
        onOpenLogin={onOpenLogin}
        onOpenProfile={onOpenProfile}
        onOpenMenu={onOpenMenu}
        onOpenAdmin={onOpenAdmin}
      />

      {/* Main Content Area */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 space-y-6 flex-1 relative z-10">
        {/* ══════════════════════════════════════════════════ */}
        {/* HERO ARCADE BANNER: DAILY GRAND JACKPOT (12:00 PM) */}
        {/* ══════════════════════════════════════════════════ */}
        <section 
          className="relative rounded-3xl p-5 md:p-7 overflow-hidden border border-amber-500/40 bg-gradient-to-br from-[#1a1303] via-[#111111] to-[#0d0d0d] shadow-[0_0_30px_rgba(245,158,11,0.2)] flex flex-col md:flex-row md:items-center md:justify-between gap-6"
          aria-label="Daily Grand Jackpot"
        >
          {/* Neon accent corner lines */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/[0.08] rounded-bl-full pointer-events-none" />
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {dailyJackpotState?.isPostponed ? (
              <span className="text-[10px] font-arcade font-black py-1 px-2.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 whitespace-nowrap">
                ⚠️ POSTPONED (NEXT: 12:00 PM)
              </span>
            ) : (
              <span className="badge-neon text-[10px] py-1 px-2.5 whitespace-nowrap bg-amber-500/20 text-amber-300 border-amber-500/30">
                <Trophy className="w-3.5 h-3.5 text-amber-300 fill-current" />
                DAILY DRAW
              </span>
            )}
            <span className="text-[10px] font-arcade font-bold py-1 px-2.5 rounded-full bg-black/60 text-white/80 border border-white/10 whitespace-nowrap">
              {dailyJackpotState?.cardsSold || 0}/200 CARDS SOLD
            </span>
          </div>

          <div className="space-y-1.5 max-w-xl">
            <div className="text-[10px] sm:text-xs font-arcade font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5 whitespace-nowrap">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>⚡ OFFICIAL 12:00 PM ETHIOPIA DRAW</span>
            </div>
            <h2 className="font-arcade text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight uppercase leading-none">
              DAILY GRAND JACKPOT
            </h2>
            <div className="pt-1.5">
              <span className="text-xs font-arcade font-bold text-white/50 uppercase block">
                Guaranteed Winner Pool
              </span>
              <span className="font-arcade text-3xl sm:text-4xl lg:text-5xl font-black text-amber-300 tracking-tight drop-shadow-[0_0_16px_rgba(245,158,11,0.5)] whitespace-nowrap">
                {(dailyJackpotState?.jackpotAmount || 100000).toLocaleString()} BIRR
              </span>
            </div>
          </div>

          <div className="pt-3 md:pt-0 border-t md:border-t-0 md:border-l border-white/10 md:pl-6 flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-white/70 font-arcade whitespace-nowrap">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Next Draw: <strong className="text-white">Daily 12:00 PM</strong></span>
            </div>

            <button
              onClick={() => {
                soundService.playClick();
                telegramSdk.triggerHaptic('medium');
                if (onOpenDailyJackpot) {
                  onOpenDailyJackpot();
                } else if (highestRoom) {
                  onJoinRoom(highestRoom.roomId);
                }
              }}
              className="btn-neon text-sm py-3 px-6 rounded-2xl flex items-center gap-2 shadow-lg whitespace-nowrap cursor-pointer bg-gradient-to-r from-amber-400 to-yellow-300 text-black border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
            >
              <Trophy className="w-4 h-4 fill-current text-black" />
              <span>ENTER JACKPOT →</span>
            </button>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* DAILY REWARDS & STREAK QUICK ENTRY CARD            */}
        {/* ══════════════════════════════════════════════════ */}
        <section 
          onClick={onOpenReferral}
          className="rounded-2xl p-3.5 bg-[#141414] border border-white/10 hover:border-[#E8FF00]/40 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.6)] group"
          aria-label="Daily Streak and Rewards"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#1c1c1c] border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-[#E8FF00]/60 transition-colors">
              <Gift className="w-6 h-6 text-[#E8FF00]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-arcade text-xs font-black uppercase text-white tracking-wider whitespace-nowrap">
                  DAILY STREAK BONUS
                </span>
                <span className="text-[9px] font-arcade font-bold px-1.5 py-0.5 rounded-full bg-[#E8FF00]/15 text-[#E8FF00] border border-[#E8FF00]/30 whitespace-nowrap">
                  DAY 3/7
                </span>
              </div>
              <p className="text-[11px] text-white/50 truncate mt-0.5">
                Claim up to <strong className="text-[#E8FF00]">500 Birr</strong> + 5% referral commission
              </p>
            </div>
          </div>

          <div className="btn-dark-arcade text-xs py-1.5 px-3 rounded-xl flex-shrink-0 group-hover:bg-[#202020] whitespace-nowrap">
            CLAIM →
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* FILTER CHIPS (ALL, FAST, LOW, HIGH)               */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="font-arcade font-black text-sm uppercase tracking-wider text-white whitespace-nowrap">
                GAME ROOMS
              </span>
              <span className="text-[10px] font-arcade font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70 whitespace-nowrap">
                {rooms.length} LIVE
              </span>
            </div>

            <button
              onClick={() => {
                onRefresh();
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
              }}
              title="Refresh Rooms"
              className="flex items-center gap-1 text-[11px] font-arcade text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCw className="w-3 h-3" />
              <span>REFRESH</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFilter(tab.id);
                    soundService.playClick();
                    telegramSdk.triggerHaptic('light');
                  }}
                  className={`px-3 py-1.5 rounded-xl font-arcade text-xs font-bold whitespace-nowrap transition-all uppercase cursor-pointer ${
                    isActive
                      ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                      : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* GAME ROOM CARDS (SPACIOUS 4-ROW ZERO-OVERLAP LAYOUT) */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map((room) => {
            const isActive = room.status === 'lobby';
            const isDrawing = room.status === 'active';
            const timerFmt = `0:${room.lobbyTimeRemaining.toString().padStart(2, '0')}`;
            const possibleWin = (isActive || isDrawing)
              ? formatCurrency(room.winnerPayoutAmount || room.playerPayoutPool || (room.totalPot > 0 ? room.totalPot * 0.8 : room.betPerCard * 8))
              : '-';

            const isFeatured = room.etbEquivalent === 50 || room.badge?.includes('POPULAR');

            return (
              <div
                key={room.roomId}
                className={`relative rounded-3xl p-4 sm:p-5 transition-all duration-200 border flex flex-col justify-between ${
                  isFeatured
                    ? 'bg-[#14160a] border-[#E8FF00]/50 shadow-[0_0_24px_rgba(232,255,0,0.18)]'
                    : 'bg-[#121212] border-white/10 hover:border-white/20 shadow-lg'
                }`}
              >
                {/* ── ROW 1: HEADER (Stake Pill on Left, Status Badge on Right) ── */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  {/* Bold Stake Pill */}
                  <div className="px-3 py-1 rounded-xl flex items-center gap-1.5 bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.35)] whitespace-nowrap">
                    <span className="font-arcade font-black text-base leading-none">
                      {room.etbEquivalent}
                    </span>
                    <span className="font-arcade font-black text-[10px] uppercase tracking-tight">
                      BIRR
                    </span>
                  </div>

                  {/* Status Indicator Pill */}
                  <div className="flex-shrink-0">
                    {isActive ? (
                      room.isCountdownActive ? (
                        <div className="flex items-center gap-1.5 font-arcade text-xs font-black px-2.5 py-1 rounded-xl bg-[#E8FF00]/20 text-[#E8FF00] border border-[#E8FF00]/40 animate-pulse whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                          <span>{timerFmt}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 font-arcade text-xs font-bold px-2.5 py-1 rounded-xl bg-white/5 text-white/70 border border-white/10 whitespace-nowrap">
                          <span>WAITING ({room.totalCardsSold}/5)</span>
                        </div>
                      )
                    ) : isDrawing ? (
                      <div className="flex items-center gap-1.5 font-arcade text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse whitespace-nowrap">
                        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>LIVE DRAW</span>
                      </div>
                    ) : (
                      <span className="text-xs font-arcade text-white/40 whitespace-nowrap">WAITING</span>
                    )}
                  </div>
                </div>

                {/* ── ROW 2: ROOM NAME & BADGE & SUBTITLE ── */}
                <div className="mb-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-arcade font-black text-base text-white uppercase tracking-tight">
                      {room.roomName}
                    </h3>
                    {room.badge && (
                      <span className="text-[9px] font-arcade font-extrabold px-2 py-0.5 rounded-full bg-[#E8FF00]/15 text-[#E8FF00] border border-[#E8FF00]/30 uppercase whitespace-nowrap">
                        {room.badge}
                      </span>
                    )}
                  </div>
                  <div className="font-arcade text-xs text-white/50 flex items-center gap-2">
                    <span>200 CARDS MAX</span>
                    <span>·</span>
                    <span className="text-[#E8FF00] font-bold">1ST BINGO 80-100%</span>
                  </div>
                </div>

                {/* ── ROW 3: CARDS SOLD COUNTER & DRAW READINESS ── */}
                <div className="flex items-center justify-between font-arcade text-xs px-3.5 py-2.5 rounded-xl bg-[#161616] border border-white/5 mb-4 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-white/70">
                    <Users className="w-3.5 h-3.5 text-[#E8FF00] flex-shrink-0" />
                    <span>CARDS: <strong className="text-white">{room.totalCardsSold} / 200</strong></span>
                  </div>

                  <span className={`font-bold ${room.totalCardsSold >= (room.minCardsToStart || 5) ? 'text-[#E8FF00]' : 'text-white/40'}`}>
                    {room.totalCardsSold >= (room.minCardsToStart || 5) ? 'READY TO DRAW' : 'MIN 5 CARDS'}
                  </span>
                </div>

                {/* ── ROW 4: ESTIMATED PRIZE & ACTION BUTTON ── */}
                <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2 whitespace-nowrap">
                  <div className="min-w-0">
                    <span className="font-arcade text-[10px] uppercase font-bold text-white/40 block leading-tight whitespace-nowrap">
                      ESTIMATED 1ST PRIZE
                    </span>
                    <span className="font-arcade font-black text-lg text-[#E8FF00] leading-none drop-shadow-[0_0_8px_rgba(232,255,0,0.3)] whitespace-nowrap">
                      {possibleWin}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      soundService.playClick();
                      telegramSdk.triggerHaptic('medium');
                      onJoinRoom(room.roomId);
                    }}
                    className={`btn-neon text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm uppercase whitespace-nowrap flex-shrink-0 cursor-pointer ${
                      isDrawing ? 'bg-white text-black border-white' : ''
                    }`}
                  >
                    <span>{isDrawing ? 'SPECTATE' : 'PLAY ROOM'}</span>
                    <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* FAST REFERRAL BANNER STRIP                         */}
        {/* ══════════════════════════════════════════════════ */}
        <section 
          onClick={onOpenReferral}
          className="rounded-2xl p-3.5 flex items-center justify-between gap-3 bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all cursor-pointer shadow-sm"
          aria-label="Referral Program"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#E8FF00]/10 border border-[#E8FF00]/30 text-[#E8FF00]">
              <Flame className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="font-arcade font-black text-xs text-white uppercase truncate whitespace-nowrap">
                EARN 5% ON EVERY TICKET BUY
              </div>
              <div className="font-arcade text-[10px] text-white/50 truncate mt-0.5 whitespace-nowrap">
                Share your referral link with friends & get instant Birr directly to your wallet
              </div>
            </div>
          </div>

          <button className="btn-dark-arcade text-xs py-1.5 px-3 rounded-xl flex-shrink-0 whitespace-nowrap cursor-pointer">
            SHARE →
          </button>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* COMPREHENSIVE BETTING DESCRIPTION SECTION          */}
        {/* ══════════════════════════════════════════════════ */}
        <BettingDescriptionSection
          onOpenRules={onOpenRules}
          onOpenProvablyFair={onOpenProvablyFair}
          onOpenReferral={onOpenReferral}
          onOpenWallet={onOpenWallet}
        />
      </main>

      {/* Bottom Nav Dock */}
      <BottomNavDock
        activeTab="rooms"
        onOpenWallet={onOpenWallet}
        onOpenReferral={onOpenReferral}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenRules={onOpenRules}
      />
    </div>
  );
};
