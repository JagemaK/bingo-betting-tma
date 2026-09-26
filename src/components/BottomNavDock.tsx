import React from 'react';
import {
  Flame,
  Gift,
  Trophy,
  Wallet as WalletIcon,
  HelpCircle,
} from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';

export type NavTabId = 'rooms' | 'wallet' | 'referral' | 'leaderboard' | 'rules';

interface BottomNavDockProps {
  activeTab?: NavTabId;
  onNavigateToRooms?: () => void;
  onOpenWallet: () => void;
  onOpenReferral: () => void;
  onOpenLeaderboard: () => void;
  onOpenRules: () => void;
  inGame?: boolean;
  hasRewardNotification?: boolean;
}

export const BottomNavDock: React.FC<BottomNavDockProps> = ({
  activeTab = 'rooms',
  onNavigateToRooms,
  onOpenWallet,
  onOpenReferral,
  onOpenLeaderboard,
  onOpenRules,
  inGame = false,
  hasRewardNotification = false,
}) => {
  const callbacks: Record<NavTabId, (() => void) | undefined> = {
    rooms: onNavigateToRooms,
    wallet: onOpenWallet,
    referral: onOpenReferral,
    leaderboard: onOpenLeaderboard,
    rules: onOpenRules,
  };

  const handleNav = (id: NavTabId) => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    const cb = callbacks[id];
    if (cb) cb();
  };

  const navItems = [
    {
      id: 'rooms' as NavTabId,
      icon: Flame,
      label: inGame ? 'IN GAME' : 'PLAY',
      isLive: inGame,
    },
    {
      id: 'referral' as NavTabId,
      icon: Gift,
      label: 'REWARDS',
      hasDot: hasRewardNotification,
    },
    {
      id: 'leaderboard' as NavTabId,
      icon: Trophy,
      label: 'RANKS',
    },
    {
      id: 'wallet' as NavTabId,
      icon: WalletIcon,
      label: 'WALLET',
    },
  ];

  return (
    <nav 
      className="fixed left-2 sm:left-4 right-2 sm:right-4 z-40 max-w-lg mx-auto pointer-events-auto md:hidden"
      style={{ bottom: 'max(0.75rem, calc(var(--tg-safe-bottom, 0px) + 0.5rem))' }}
      aria-label="Bottom Navigation"
    >
      {/* Arcade Chunky Glass Capsule */}
      <div className="relative rounded-2xl flex items-center justify-around px-1 sm:px-2 py-1.5 bg-[#121212]/92 backdrop-blur-2xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.85)]">
        {/* Subtle top neon laser line */}
        <div className="absolute -top-px left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-[#E8FF00]/30 to-transparent pointer-events-none" />

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-1 sm:px-2.5 rounded-xl transition-all cursor-pointer relative flex-1 min-w-0 ${
                isActive
                  ? 'text-[#E8FF00] bg-white/[0.04]'
                  : 'text-white/45 hover:text-white/80 active:scale-95'
              }`}
            >
              <div className="relative shrink-0">
                <Icon
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(232,255,0,0.6)]' : ''
                  }`}
                />
                
                {/* In-game active pulse */}
                {item.isLive && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#E8FF00] shadow-[0_0_8px_rgba(232,255,0,0.9)] animate-ping" />
                )}

                {/* Unobtrusive small circular notification dot without text */}
                {item.hasDot && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#E8FF00] shadow-[0_0_6px_rgba(232,255,0,0.8)]" />
                )}
              </div>

              <span
                className={`font-arcade text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider mt-0.5 transition-colors whitespace-nowrap truncate max-w-full ${
                  isActive ? 'text-[#E8FF00]' : 'text-white/50'
                }`}
              >
                {item.label}
              </span>

              {/* Active Indicator dot */}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF00] shadow-[0_0_6px_#E8FF00] mt-0.5 animate-fadeIn shrink-0" />
              )}
            </button>
          );
        })}

        {/* Quick Rules Mini Trigger */}
        <button
          onClick={() => handleNav('rules')}
          title="Game Rules"
          className="flex flex-col items-center justify-center py-1 px-1.5 sm:px-2 text-white/30 hover:text-white/70 transition-colors cursor-pointer shrink-0"
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="font-arcade text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mt-0.5 whitespace-nowrap">
            HELP
          </span>
        </button>
      </div>
    </nav>
  );
};
