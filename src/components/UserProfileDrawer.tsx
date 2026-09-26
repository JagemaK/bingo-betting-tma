import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet as WalletIcon,
  Plus,
  ArrowDownToLine,
  History,
  Gift,
  ShieldCheck,
  HelpCircle,
  Headphones,
  LogOut,
  User,
  Crown,
  ChevronRight,
  Phone,
  Sparkles,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Flame,
  ArrowLeft
} from 'lucide-react';
import { UserAccount, UserProfile } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { ModalHeader } from './ModalHeader.js';
import { useAuth } from '../services/authContext.js';
import { apiUrl } from '../config/api.js';

interface UserProfileDrawerProps {
  isOpen: boolean;
  user: UserAccount | null;
  onClose: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenHistory: () => void;
  onOpenReferral: () => void;
  onOpenRules: () => void;
  onOpenProvablyFair: () => void;
  onOpenContact: () => void;
  onOpenLogin: () => void;
  onOpenSignUp: () => void;
  onLogout: () => void;
  onOpenAdmin?: () => void;
}

export const UserProfileDrawer: React.FC<UserProfileDrawerProps> = ({
  isOpen,
  user,
  onClose,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenHistory,
  onOpenReferral,
  onOpenRules,
  onOpenProvablyFair,
  onOpenContact,
  onOpenLogin,
  onOpenSignUp,
  onLogout,
  onOpenAdmin,
}) => {
  const { sessionToken } = useAuth();
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [soundOn, setSoundOn] = useState(soundService.isSoundEnabled());
  const [voiceOn, setVoiceOn] = useState(soundService.isVoiceCallerEnabled());

  // Strictly isolate profile data per authenticated user session
  useEffect(() => {
    if (!isOpen || !user) {
      setProfileData(null);
      return;
    }

    let isMounted = true;
    const token = sessionToken || localStorage.getItem('bingo_auth_token');
    if (!token) return;

    fetch(apiUrl('/api/profile'), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data?.profile) {
          setProfileData(data.profile);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch authoritative user profile:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.playerId, sessionToken]);

  if (!isOpen) return null;

  const getInitial = (name?: string) => {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  };

  const formatBalance = () => {
    const bal = profileData?.walletBalance ?? user?.walletBalance;
    if (typeof bal !== 'number') return '0.00';
    return bal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleCopyId = () => {
    if (!user?.playerId) return;
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    navigator.clipboard?.writeText(user.playerId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const toggleSound = () => {
    const next = !soundOn;
    soundService.setSoundEnabled(next);
    setSoundOn(next);
    if (next) soundService.playClick();
    telegramSdk.triggerHaptic('light');
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    soundService.setVoiceCallerEnabled(next);
    setVoiceOn(next);
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="PLAYER PROFILE"
          badge="VIP LOUNGE"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Profile"
        />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {user ? (
          <>
            {/* 1. HERO PROFILE CARD */}
            {(() => {
              const activeUsername = profileData?.username || user.username;
              const displayPhone = profileData?.phone || user.phone;
              const telegramHandle = profileData?.telegram_username || (user as any).telegram_username;
              const currentStreak = profileData ? profileData.currentStreak : (user.currentStreak ?? 0);
              const totalGamesPlayed = profileData ? profileData.totalGamesPlayed : (user.totalGamesPlayed ?? 0);
              const totalWonETB = profileData ? profileData.totalWonETB : (user.totalWonETB ?? 0);
              const level = profileData ? profileData.level : (user.level ?? 1);
              const levelProgressXp = profileData ? profileData.levelProgressXp : (user.levelProgressXp ?? 0);
              const levelTotalXp = profileData ? profileData.levelTotalXp : (user.levelTotalXp ?? 500);
              const levelPercent = profileData ? profileData.levelPercent : (user.levelPercent ?? 0);
              const vipTier = profileData?.vipTier || user.vipTier || 'BRONZE VIP';

              return (
                <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 relative overflow-hidden shadow-sm">
                  <div className="flex items-center gap-3.5">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={activeUsername}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-[#E8FF00] shadow-[0_0_15px_rgba(232,255,0,0.3)]"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-[#E8FF00] text-black flex items-center justify-center font-arcade font-black text-2xl shadow-[0_0_15px_rgba(232,255,0,0.4)]">
                          {getInitial(activeUsername)}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#111111] flex items-center justify-center text-[8px] text-black font-bold">
                        ✓
                      </span>
                    </div>

                    {/* User Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-arcade font-black text-base text-white truncate">
                          {activeUsername}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[8px] font-arcade font-bold">
                          VERIFIED
                        </span>
                      </div>

                      <div className="text-[10px] font-arcade text-white/50 flex items-center gap-1 mt-0.5">
                        {displayPhone ? (
                          <>
                            <Phone className="w-3 h-3 text-[#E8FF00]" />
                            <span>{displayPhone}</span>
                          </>
                        ) : telegramHandle ? (
                          <>
                            <span className="text-[#E8FF00] font-bold text-[11px]">@</span>
                            <span>{telegramHandle}</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3 text-[#E8FF00]" />
                            <span>Telegram Account</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={handleCopyId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#181818] border border-white/10 text-[9px] font-mono text-white/60 hover:text-white transition-all cursor-pointer"
                        >
                          <span>ID: #{user.playerId.replace('usr_', '').slice(-6)}</span>
                          {copiedId ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        </button>
                        {copiedId && (
                          <span className="text-[9px] text-emerald-400 font-arcade">Copied!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* VIP XP Bar */}
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-arcade">
                      <div className="flex items-center gap-1 text-[#E8FF00] font-black">
                        <Crown className="w-3 h-3" />
                        <span>{vipTier}</span>
                      </div>
                      <span className="text-white/40">LEVEL {level} • {levelProgressXp.toLocaleString()} / {levelTotalXp.toLocaleString()} XP</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#1c1c1c] overflow-hidden">
                      <div
                        className="h-full bg-[#E8FF00] rounded-full shadow-[0_0_8px_rgba(232,255,0,0.6)] transition-all duration-500"
                        style={{ width: `${levelPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* 3 Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center font-arcade">
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5">
                      <div className="text-[8px] text-white/40 uppercase">GAMES</div>
                      <div className="font-black text-xs text-white mt-0.5">{totalGamesPlayed}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5">
                      <div className="text-[8px] text-white/40 uppercase">TOTAL WON</div>
                      <div className="font-black text-xs text-[#E8FF00] mt-0.5">{totalWonETB.toLocaleString()} B</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5">
                      <div className="text-[8px] text-white/40 uppercase">STREAK</div>
                      <div className="font-black text-xs text-amber-400 mt-0.5 flex items-center justify-center gap-0.5">
                        <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>{currentStreak}x</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 2. WALLET SUMMARY & FAST CASHIER */}
            <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <WalletIcon className="w-4 h-4 text-[#E8FF00]" />
                  <span className="text-[10px] font-arcade font-black text-white/60 uppercase">
                    WALLET BALANCE
                  </span>
                </div>
                <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  INSTANT WITHDRAWAL
                </span>
              </div>

              {(() => {
                const cashBal = profileData?.walletBalance ?? user?.walletBalance ?? 0;
                const bonusBal = profileData?.bonusBalance ?? user?.bonusBalance ?? 0;
                if (bonusBal > 0) {
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="font-arcade font-black text-2xl text-[#E8FF00] drop-shadow-[0_0_12px_rgba(232,255,0,0.3)]">
                            {cashBal.toFixed(2)} BIRR
                          </div>
                          <div className="text-[9px] font-arcade text-white/50 tracking-wider">CASH (WITHDRAWABLE)</div>
                        </div>
                        <div className="text-right">
                          <div className="font-arcade font-bold text-base text-amber-300">
                            +{bonusBal.toFixed(2)} BIRR
                          </div>
                          <div className="text-[9px] font-arcade text-amber-400/80 tracking-wider">PROMO (BINGO ONLY)</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-white/40 font-mono">
                        Total Playable: <span className="text-white font-bold">{(cashBal + bonusBal).toFixed(2)} BIRR</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="font-arcade font-black text-3xl text-[#E8FF00] drop-shadow-[0_0_12px_rgba(232,255,0,0.3)]">
                    {formatBalance()} BIRR
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    soundService.playClick();
                    telegramSdk.triggerHaptic('medium');
                    onClose();
                    onOpenDeposit();
                  }}
                  className="btn-neon py-2.5 rounded-xl font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>DEPOSIT</span>
                </button>

                <button
                  onClick={() => {
                    soundService.playClick();
                    telegramSdk.triggerHaptic('light');
                    onClose();
                    onOpenWithdraw();
                  }}
                  className="py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-white/10 font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 text-white cursor-pointer active:scale-95"
                >
                  <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                  <span>WITHDRAW</span>
                </button>
              </div>

              {/* Audio Controls */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-arcade font-black text-white/50 uppercase">
                  SOUND & CALLER
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSound}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-arcade font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      soundOn
                        ? 'bg-[#E8FF00] text-black border-[#E8FF00]'
                        : 'bg-[#181818] border-white/10 text-white/40'
                    }`}
                  >
                    {soundOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    <span>SFX</span>
                  </button>

                  <button
                    onClick={toggleVoice}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-arcade font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      voiceOn
                        ? 'bg-[#E8FF00] text-black border-[#E8FF00]'
                        : 'bg-[#181818] border-white/10 text-white/40'
                    }`}
                  >
                    {voiceOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    <span>VOICE</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. GAMING SERVICES TILES */}
            <div className="space-y-2">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                QUICK ACCESS SERVICES
              </span>

              <div className="space-y-2">
                {/* Agent Dashboard (Only for AGENT role) */}
                {user?.role === 'AGENT' && onOpenAdmin && (
                  <button
                    onClick={() => {
                      soundService.playClick();
                      onClose();
                      onOpenAdmin();
                    }}
                    className="w-full p-3 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-600/20 hover:bg-emerald-500/30 border border-emerald-400/40 flex items-center justify-between transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)] active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-400/20 border border-emerald-400/50 text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="text-left">
                        <div className="font-arcade font-black text-xs text-emerald-300 flex items-center gap-1.5">
                          <span>AGENT DASHBOARD</span>
                          <span className="text-[8px] font-arcade font-bold px-1.5 py-0.5 rounded bg-emerald-400 text-black">
                            AGENT
                          </span>
                        </div>
                        <div className="text-[10px] font-arcade text-white/50">Approve deposits, process withdrawals & customer queries</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  </button>
                )}

                {/* Super Admin Dashboard (For SUPER_ADMIN and legacy ADMIN roles) */}
                {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && onOpenAdmin && (
                  <button
                    onClick={() => {
                      soundService.playClick();
                      onClose();
                      onOpenAdmin();
                    }}
                    className="w-full p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-600/20 hover:bg-amber-500/30 border border-amber-400/40 flex items-center justify-between transition-all cursor-pointer shadow-[0_0_15px_rgba(232,255,0,0.15)] active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-400 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="text-left">
                        <div className="font-arcade font-black text-xs text-amber-300 flex items-center gap-1.5">
                          <span>SUPER ADMIN DASHBOARD</span>
                          <span className="text-[8px] font-arcade font-bold px-1.5 py-0.5 rounded bg-amber-400 text-black">
                            OWNER
                          </span>
                        </div>
                        <div className="text-[10px] font-arcade text-white/50">Agent governance, finance, weekend jackpot & logs</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  </button>
                )}

                {/* Tile 1: Rewards & Affiliate */}
                <button
                  onClick={() => {
                    soundService.playClick();
                    onClose();
                    onOpenReferral();
                  }}
                  className="w-full p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 text-[#E8FF00] flex items-center justify-center flex-shrink-0">
                      <Gift className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="text-left">
                      <div className="font-arcade font-black text-xs text-white flex items-center gap-1.5">
                        <span>REWARDS & AFFILIATE</span>
                        <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-[#E8FF00] text-black">
                          BONUS HUB
                        </span>
                      </div>
                      <div className="text-[10px] font-arcade text-white/40">First deposit, room play & referrals</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>

                {/* Tile 2: Transaction Ledger */}
                <button
                  onClick={() => {
                    soundService.playClick();
                    onClose();
                    onOpenHistory();
                  }}
                  className="w-full p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#1c1c1c] border border-white/10 text-white/70 flex items-center justify-center flex-shrink-0">
                      <History className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="text-left">
                      <div className="font-arcade font-black text-xs text-white">TRANSACTION LEDGER</div>
                      <div className="text-[10px] font-arcade text-white/40">Complete records of deposits, bets & wins</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>

                {/* Tile 3: Provably Fair Audit */}
                <button
                  onClick={() => {
                    soundService.playClick();
                    onClose();
                    onOpenProvablyFair();
                  }}
                  className="w-full p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="text-left">
                      <div className="font-arcade font-black text-xs text-white">PROVABLY FAIR AUDIT</div>
                      <div className="text-[10px] font-arcade text-white/40">SHA-256 seed & cryptographic integrity</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>

                {/* Tile 4: Rules & Paytables */}
                <button
                  onClick={() => {
                    soundService.playClick();
                    onClose();
                    onOpenRules();
                  }}
                  className="w-full p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#1c1c1c] border border-white/10 text-white/70 flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="text-left">
                      <div className="font-arcade font-black text-xs text-white">RULES & PAYTABLES</div>
                      <div className="text-[10px] font-arcade text-white/40">80% Standard winner pot & 5P bonuses</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>

                {/* Tile 5: 24/7 Telegram Support */}
                <button
                  onClick={() => {
                    soundService.playClick();
                    onClose();
                    onOpenContact();
                  }}
                  className="w-full p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-400 flex items-center justify-center flex-shrink-0">
                      <Headphones className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="text-left">
                      <div className="font-arcade font-black text-xs text-white flex items-center gap-1.5">
                        <span>TELEGRAM VIP CONCIERGE</span>
                        <span className="text-[8px] font-arcade font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                          24/7 LIVE
                        </span>
                      </div>
                      <div className="text-[10px] font-arcade text-white/40">Direct human help for deposits & game inquiries</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>
              </div>
            </div>

            {/* Log Out */}
            <div className="pt-2 flex items-center justify-between border-t border-white/10">
              <span className="text-[9px] font-mono text-white/40">
                GLI-11 CERTIFIED • BINGO BET
              </span>

              <button
                onClick={() => {
                  soundService.playClick();
                  telegramSdk.triggerHaptic('medium');
                  onLogout();
                  onClose();
                }}
                className="py-2 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-arcade font-black text-xs uppercase border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </>
        ) : (
          <div className="p-6 rounded-2xl bg-[#111111] border border-white/10 text-center space-y-4 my-8 font-arcade">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00]">
              <User className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">GUEST PLAYER</h3>
              <p className="text-xs text-white/50 mt-1">
                Log in to enjoy live 75-Ball bingo tournaments, VIP leaderboard ranks, and instant Birr rewards!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  soundService.playClick();
                  onClose();
                  onOpenSignUp();
                }}
                className="btn-neon py-2.5 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Sign Up
              </button>
              <button
                onClick={() => {
                  soundService.playClick();
                  onClose();
                  onOpenLogin();
                }}
                className="py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] text-white text-xs font-black uppercase border border-white/10 cursor-pointer"
              >
                Log In
              </button>
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  );
};
