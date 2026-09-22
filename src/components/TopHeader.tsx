import React from 'react';
import {
  ChevronLeft,
  Wallet as WalletIcon,
  Volume2,
  VolumeX,
  Zap,
  Clock,
  Plus,
  Flame,
  Sparkles,
  Gift,
  Trophy,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { UserAccount } from '../types/bingo.js';

interface TopHeaderProps {
  mode: 'lobby' | 'card_selection' | 'live_game';
  user: UserAccount | null;
  roomName?: string;
  stakeFormatted?: string;
  countdownTimer?: string;
  isCountdownActive?: boolean;
  totalCardsSold?: number;
  minCardsToStart?: number;
  autoDaub?: boolean;
  soundEnabled?: boolean;
  onToggleAutoDaub?: () => void;
  onToggleSound?: () => void;
  onBack?: () => void;
  onOpenWallet: () => void;
  onOpenRules?: () => void;
  onOpenProvablyFair?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenReferral?: () => void;
  onOpenSignUp?: () => void;
  onOpenLogin?: () => void;
  onOpenProfile?: () => void;
  onOpenMenu?: () => void;
  onOpenAdmin?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  mode,
  user,
  roomName,
  stakeFormatted,
  countdownTimer,
  isCountdownActive = false,
  totalCardsSold = 0,
  minCardsToStart = 5,
  autoDaub,
  soundEnabled = true,
  onToggleAutoDaub,
  onToggleSound,
  onBack,
  onOpenWallet,
  onOpenRules,
  onOpenProvablyFair,
  onOpenLeaderboard,
  onOpenReferral,
  onOpenSignUp,
  onOpenLogin,
  onOpenProfile,
  onOpenMenu,
  onOpenAdmin,
}) => {
  const formatBalance = () => {
    if (!user) return '0';
    const total = user.totalPlayableBalance ?? ((user.walletBalance || 0) + (user.bonusBalance || 0));
    return total.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const getInitial = (name?: string) => {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  };

  const handleWalletClick = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');
    if (!user && onOpenSignUp) onOpenSignUp();
    else onOpenWallet();
  };

  const handleProfileClick = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    if (onOpenProfile) onOpenProfile();
    else if (onOpenMenu) onOpenMenu();
  };

  // Arcade Neon Wallet Pill
  const WalletPill = () => (
    <button
      onClick={handleWalletClick}
      className="group relative flex items-center gap-1 sm:gap-1.5 pl-2 pr-0.5 sm:pr-1 py-1 rounded-full bg-[#161616] hover:bg-[#1c1c1c] border border-white/10 hover:border-[#E8FF00]/40 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0"
      title="Open Wallet"
    >
      <WalletIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#E8FF00] shrink-0" />
      <div className="flex items-baseline gap-0.5 sm:gap-1">
        <span className="text-[8px] sm:text-[9px] font-arcade font-bold text-white/50">
          ETB
        </span>
        <span className="font-arcade font-black text-[11px] sm:text-xs text-white max-w-[65px] sm:max-w-[85px] md:max-w-[110px] truncate">
          {formatBalance()}
        </span>
        {user?.bonusBalance && user.bonusBalance > 0 ? (
          <span className="hidden sm:inline-block text-[8px] font-arcade px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
            +{(user.bonusBalance).toFixed(0)}B
          </span>
        ) : null}
      </div>

      {/* Chunky Neon Plus Orb */}
      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shrink-0 bg-[#E8FF00] text-black shadow-[0_0_8px_rgba(232,255,0,0.5)] group-hover:scale-105 transition-transform">
        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />
      </div>
    </button>
  );

  return (
    <header className="w-full sticky top-0 z-30 pointer-events-none pt-[max(0.375rem,env(safe-area-inset-top))] px-2.5 sm:px-4 lg:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 p-1.5 sm:p-2 rounded-2xl bg-[#0c0c0c]/90 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.5)] pointer-events-auto">
        {/* ══════════════════════════════════ */}
        {/* MODE 1: LOBBY                     */}
        {/* ══════════════════════════════════ */}
        {mode === 'lobby' && (
          <>
            {/* LEFT: [B icon] BINGO BET */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
              <div className="relative shrink-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center bg-[#161616] border border-[#E8FF00]/40 shadow-[0_0_10px_rgba(232,255,0,0.2)]">
                  <span className="font-arcade font-black text-sm sm:text-base text-[#E8FF00]">
                    B
                  </span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E8FF00] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E8FF00]" />
                </span>
              </div>

              <div className="flex items-center gap-1 leading-none min-w-0">
                <span className="font-arcade font-black text-xs sm:text-sm md:text-base tracking-tight text-white uppercase whitespace-nowrap">
                  BINGO
                </span>
                <span className="font-arcade font-black text-xs sm:text-sm md:text-base tracking-tight text-[#E8FF00] uppercase whitespace-nowrap">
                  BET
                </span>
              </div>
            </div>

            {/* RIGHT: [Admin Control (if admin)] [Wallet + ETB + Plus] [Profile / Auth Buttons] */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Role-Aware Security / Admin Control */}
              {user?.role === 'ADMIN' && onOpenAdmin && (
                <button
                  onClick={() => {
                    soundService.playClick();
                    telegramSdk.triggerHaptic('medium');
                    onOpenAdmin();
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-xl bg-gradient-to-r from-amber-500/25 to-yellow-500/20 border border-amber-400/60 text-amber-300 font-arcade font-black text-[10px] tracking-wider uppercase hover:bg-amber-500/30 transition-all cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.25)] active:scale-95 shrink-0"
                  title="Admin Control Center"
                  aria-label="Admin Control Center"
                >
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  <span>ADMIN</span>
                </button>
              )}

              {/* Wallet Pill: [Wallet Icon + ETB Balance + Plus Button] */}
              <WalletPill />

              {/* Profile Avatar Squircle: [M] */}
              {user ? (
                <button
                  onClick={handleProfileClick}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#161616] hover:bg-[#202020] border border-white/15 flex items-center justify-center font-arcade font-black text-xs text-[#E8FF00] active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Open Profile"
                  aria-label="Open Profile"
                >
                  {getInitial(user.username)}
                </button>
              ) : (
                <button
                  onClick={() => {
                    soundService.playClick();
                    telegramSdk.triggerHaptic('light');
                    if (onOpenLogin) onOpenLogin();
                  }}
                  className="px-2.5 py-1 rounded-xl font-arcade font-bold text-[11px] text-white/80 hover:text-white bg-[#161616] border border-white/10 active:scale-95 transition-all cursor-pointer uppercase shrink-0"
                >
                  Log In
                </button>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════ */}
        {/* MODE 2: CARD SELECTION            */}
        {/* ══════════════════════════════════ */}
        {mode === 'card_selection' && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              {onBack && (
                <button
                  onClick={() => { soundService.playClick(); telegramSdk.triggerHaptic('light'); onBack(); }}
                  className="p-1.5 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  title="Back to Lobby"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              )}
              <div className="min-w-0">
                <div className="font-arcade font-black text-xs sm:text-sm text-white tracking-tight truncate uppercase">
                  {roomName || 'Select Cards'}
                </div>
                <div className="font-arcade text-[9px] sm:text-[10px] text-[#E8FF00] font-bold">
                  {stakeFormatted ? `${stakeFormatted} / Card` : '200 Cards'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Countdown Pill */}
              <div
                className={`flex items-center gap-1 sm:gap-1.5 font-arcade font-black text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full border ${
                  isCountdownActive
                    ? 'bg-[#E8FF00]/15 text-[#E8FF00] border-[#E8FF00]/50 animate-pulse'
                    : 'bg-[#141414] text-white/60 border-white/10'
                }`}
              >
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#E8FF00]" />
                <span>{isCountdownActive ? (countdownTimer || '0:20') : `${totalCardsSold}/${minCardsToStart}`}</span>
              </div>
              <WalletPill />
            </div>
          </>
        )}

        {/* ══════════════════════════════════ */}
        {/* MODE 3: LIVE GAME                 */}
        {/* ══════════════════════════════════ */}
        {mode === 'live_game' && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              {onBack && (
                <button
                  onClick={() => { soundService.playClick(); telegramSdk.triggerHaptic('light'); onBack(); }}
                  className="p-1.5 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  title="Leave Room"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-arcade font-black text-xs sm:text-sm text-white tracking-tight truncate uppercase">
                    {roomName || 'Live Game'}
                  </span>
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#E8FF00] shadow-[0_0_8px_rgba(232,255,0,0.8)] animate-pulse flex-shrink-0" />
                </div>
                <div className="text-[8px] sm:text-[9px] font-arcade font-bold text-[#E8FF00] uppercase tracking-wider">
                  Live Drawing
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Auto-Daub Toggle */}
              {onToggleAutoDaub !== undefined && (
                <button
                  onClick={() => { soundService.playClick(); telegramSdk.triggerHaptic('light'); onToggleAutoDaub(); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] sm:text-xs font-arcade font-bold cursor-pointer transition-all active:scale-95 border ${
                    autoDaub
                      ? 'bg-[#E8FF00] text-black border-[#E8FF00] shadow-[0_0_10px_rgba(232,255,0,0.4)]'
                      : 'bg-[#141414] text-white/50 border-white/10'
                  }`}
                  title="Toggle Auto-Daub"
                >
                  <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>{autoDaub ? 'AUTO' : 'MANUAL'}</span>
                </button>
              )}

              {onToggleSound && (
                <button
                  onClick={() => { soundService.playClick(); onToggleSound(); }}
                  className="p-1.5 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                  title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E8FF00]" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/30" />
                  )}
                </button>
              )}

              <WalletPill />
            </div>
          </>
        )}
      </div>
    </header>
  );
};
