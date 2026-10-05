import React, { useState } from 'react';
import {
  Clock,
  ArrowRight,
  Flame,
  Zap,
  Users,
  Play,
  RotateCw,
  Trophy,
  AlertCircle,
  CheckCircle2,
  Ticket,
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
  hasRewardNotification?: boolean;
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
  hasRewardNotification = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const formatCurrency = (val: number) => `${((val ?? 0)).toLocaleString()} Birr`;

  // Find featured or highest pool room for hero
  const highestRoom = [...rooms].sort((a, b) => (b.totalPot || 0) - (a.totalPot || 0))[0] || rooms[0];

  // Daily Grand Jackpot stats & state helpers (Displays 150,000 BIRR minimum as required)
  const jackpotAmount = (dailyJackpotState?.jackpotAmount && dailyJackpotState.jackpotAmount > 150000) ? dailyJackpotState.jackpotAmount : 150000;
  const cardsSold = dailyJackpotState?.cardsSold || 0;
  const maxCards = dailyJackpotState?.maxCards || 200;
  const minCards = dailyJackpotState?.minCards || 100;
  const progressPercent = Math.min(100, Math.max(0, Math.round((cardsSold / maxCards) * 100)));
  const userTicketsCount = dailyJackpotState?.myTickets?.length || 0;
  const isPostponed = Boolean(dailyJackpotState?.isPostponed || (dailyJackpotState?.status === 'POSTPONED' && cardsSold < 100));
  const jackpotStatus = dailyJackpotState?.status || (isPostponed ? 'POSTPONED' : 'REGISTRATION_OPEN');

  const renderJackpotStatusBadge = () => {
    if (isPostponed || (jackpotStatus === 'POSTPONED' && cardsSold < 100)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>POSTPONED · NEXT DRAW 12:00 PM</span>
        </span>
      );
    }
    if (jackpotStatus === 'REGISTRATION_OPEN') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>REGISTRATION OPEN</span>
        </span>
      );
    }
    if (jackpotStatus === 'REGISTRATION_CLOSED' || jackpotStatus === 'CHECKING_ELIGIBILITY') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>REGISTRATION CLOSED</span>
        </span>
      );
    }
    if (jackpotStatus === 'GAME_RUNNING' || jackpotStatus === 'JACKPOT_READY') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0 animate-pulse">
          <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>GAME RUNNING</span>
        </span>
      );
    }
    if (jackpotStatus === 'WINNER_FOUND' || jackpotStatus === 'JACKPOT_PAID') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/25 text-amber-200 border border-amber-400/40 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
          <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>WINNER ANNOUNCED</span>
        </span>
      );
    }
    if (jackpotStatus === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/80 border border-white/20 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-white/70 shrink-0" />
          <span>ROUND COMPLETED</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] sm:text-xs font-arcade font-bold tracking-wide shrink-0">
        <Trophy className="w-3.5 h-3.5 text-amber-300 fill-current shrink-0" />
        <span>DAILY DRAW · 12:00 PM</span>
      </span>
    );
  };

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
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-2.5 sm:pt-4 pb-24 space-y-3 sm:space-y-4 flex-1 relative z-10">
        {/* ══════════════════════════════════════════════════ */}
        {/* COMPACT EVENT BANNER: WEEKEND JACKPOT (Sunday 10:00 AM) */}
        {/* ══════════════════════════════════════════════════ */}
        <section 
          className="relative rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 overflow-hidden border border-amber-500/35 bg-gradient-to-br from-[#1a1303] via-[#111111] to-[#0c0c0c] shadow-[0_0_25px_rgba(245,158,11,0.18)] flex flex-col gap-2.5 sm:gap-3 w-full"
          aria-label="Weekend Jackpot"
        >
          {/* Subtle ambient glows (pointer-events-none, strictly behind content) */}
          <div className="absolute -top-10 -right-10 w-36 h-36 bg-amber-500/[0.07] rounded-full blur-2xl pointer-events-none -z-0" />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-yellow-500/[0.04] rounded-full blur-2xl pointer-events-none -z-0" />

          {/* 1. TOP META BAR: Clean horizontal flow with wrap, NO collision or absolute positioning */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 w-full">
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-arcade font-black text-amber-400 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
              <span>OFFICIAL SUNDAY 10:00 AM DRAW</span>
            </div>
            
            {/* Status Badge in natural flow */}
            {renderJackpotStatusBadge()}
          </div>

          {/* 2. TITLE & GUARANTEED PRIZE ROW: Responsive side-by-side or stacked without collision */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-3">
            <div className="min-w-0">
              <h2 className="font-arcade text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight uppercase leading-tight">
                WEEKEND JACKPOT
              </h2>

              {/* User Participation Pill (if user has active cards) */}
              {userTicketsCount > 0 && (
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-arcade font-bold">
                    <Ticket className="w-3 h-3 shrink-0" />
                    <span>YOU'RE IN — {userTicketsCount} CARD{userTicketsCount > 1 ? 'S' : ''}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="font-arcade text-2xl sm:text-3xl font-black text-amber-300 tracking-tight drop-shadow-[0_0_14px_rgba(245,158,11,0.5)] leading-none shrink-0">
              {jackpotAmount.toLocaleString()} BIRR
            </div>
          </div>

          {/* 3. CARDS SOLD PROGRESS METER: Streamlined compact container */}
          <div className="relative z-10 p-2 sm:p-2.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-arcade font-bold">
              <div className="flex items-center gap-1.5 text-white/70 text-[10px] sm:text-xs">
                <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>CARDS SOLD</span>
              </div>
              <span className="text-white font-black text-xs sm:text-sm">
                {cardsSold} / {maxCards}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-white/10 h-1.5 sm:h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Min to Draw / Price / Max indicators */}
            <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-arcade text-white/40">
              <span>Min to Draw: {minCards}</span>
              <span className="text-amber-300/80 font-bold">999 Birr / Card</span>
              <span>Max: {maxCards}</span>
            </div>
          </div>

          {/* 4. FOOTER: NEXT DRAW INFO & CTA BUTTON */}
          <div className="relative z-10 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-white/70 font-arcade shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Next Draw: <strong className="text-white">Sunday 10:00 AM</strong></span>
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
              className="btn-neon text-xs sm:text-sm py-2 px-3.5 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-arcade font-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-transform w-full xs:w-auto shrink-0"
            >
              <Trophy className="w-3.5 h-3.5 fill-current text-black shrink-0" />
              <span>ENTER JACKPOT →</span>
            </button>
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
            const timerFmt = `0:${(room.lobbyTimeRemaining ?? 0).toString().padStart(2, '0')}`;
            const possibleWin = (isActive || isDrawing)
              ? formatCurrency(room.winnerPayoutAmount || room.playerPayoutPool || (room.totalPot > 0 ? room.totalPot * 0.8 : room.betPerCard * 8))
              : '-';

            const isFeatured = room.etbEquivalent === 50 || room.badge?.includes('POPULAR');

            return (
              <div
                key={room.roomId}
                onClick={() => {
                  soundService.playClick();
                  telegramSdk.triggerHaptic('medium');
                  onJoinRoom(room.roomId);
                }}
                className={`relative rounded-3xl p-4 sm:p-5 transition-all duration-200 border flex flex-col justify-between cursor-pointer active:scale-[0.99] ${
                  isFeatured
                    ? 'bg-[#14160a] border-[#E8FF00]/50 shadow-[0_0_24px_rgba(232,255,0,0.18)] hover:border-[#E8FF00]'
                    : 'bg-[#121212] border-white/10 hover:border-white/30 shadow-lg'
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
                <div className="mb-3 space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                    <h3 className="font-arcade font-black text-sm sm:text-base text-white uppercase tracking-tight truncate whitespace-nowrap min-w-0">
                      {room.roomName}
                    </h3>
                    {room.badge && (
                      <span className="text-[9px] font-arcade font-extrabold px-2 py-0.5 rounded-full bg-[#E8FF00]/15 text-[#E8FF00] border border-[#E8FF00]/30 uppercase whitespace-nowrap shrink-0">
                        {room.badge}
                      </span>
                    )}
                  </div>
                  <div className="font-arcade text-[11px] sm:text-xs text-white/50 flex items-center gap-1.5 sm:gap-2 truncate whitespace-nowrap">
                    <span>200 CARDS MAX</span>
                    <span>·</span>
                    <span className="text-[#E8FF00] font-bold">1ST BINGO 80-100%</span>
                  </div>
                </div>

                {/* ── ROW 3: CARDS SOLD COUNTER & DRAW READINESS ── */}
                <div className="flex items-center justify-between font-arcade text-xs px-3.5 py-2.5 rounded-xl bg-[#161616] border border-white/5 mb-4 whitespace-nowrap min-w-0">
                  <div className="flex items-center gap-2 text-white/70 min-w-0 truncate">
                    <Users className="w-3.5 h-3.5 text-[#E8FF00] shrink-0" />
                    <span className="truncate">CARDS: <strong className="text-white">{room.totalCardsSold} / 200</strong></span>
                  </div>

                  <span className={`font-bold shrink-0 ${room.totalCardsSold >= (room.minCardsToStart || 5) ? 'text-[#E8FF00]' : 'text-white/40'}`}>
                    {room.totalCardsSold >= (room.minCardsToStart || 5) ? 'READY TO DRAW' : 'MIN 5 CARDS'}
                  </span>
                </div>

                {/* ── ROW 4: ESTIMATED PRIZE & ACTION BUTTON ── */}
                <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2 whitespace-nowrap min-w-0">
                  <div className="min-w-0 flex-1">
                    <span className="font-arcade text-[9px] sm:text-[10px] uppercase font-bold text-white/40 block leading-tight truncate whitespace-nowrap">
                      ESTIMATED 1ST PRIZE
                    </span>
                    <span className="font-arcade font-black text-base sm:text-lg text-[#E8FF00] leading-none drop-shadow-[0_0_8px_rgba(232,255,0,0.3)] truncate whitespace-nowrap block mt-0.5">
                      {possibleWin}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      soundService.playClick();
                      telegramSdk.triggerHaptic('medium');
                      onJoinRoom(room.roomId);
                    }}
                    className={`btn-neon text-xs py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl flex items-center gap-1.5 shadow-sm uppercase whitespace-nowrap shrink-0 cursor-pointer ${
                      isDrawing ? 'bg-white text-black border-white' : ''
                    }`}
                  >
                    <span>{isDrawing ? 'SPECTATE' : 'PLAY ROOM'}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
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
          className="rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-2.5 sm:gap-3 bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all cursor-pointer shadow-sm min-w-0"
          aria-label="Referral Program"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#E8FF00]/10 border border-[#E8FF00]/30 text-[#E8FF00]">
              <Flame className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-arcade font-black text-xs text-white uppercase truncate whitespace-nowrap">
                EARN 5% ON EVERY TICKET BUY
              </div>
              <div className="font-arcade text-[10px] text-white/50 truncate mt-0.5 whitespace-nowrap">
                Share your referral link with friends & get instant Birr directly to your wallet
              </div>
            </div>
          </div>

          <button className="btn-dark-arcade text-xs py-1.5 px-3 rounded-xl shrink-0 whitespace-nowrap cursor-pointer">
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
        hasRewardNotification={hasRewardNotification}
      />
    </div>
  );
};
