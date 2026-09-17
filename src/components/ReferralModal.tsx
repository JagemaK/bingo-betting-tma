import React, { useState, useEffect } from 'react';
import {
  Share2,
  Users,
  DollarSign,
  Copy,
  CheckCircle2,
  Sparkles,
  X,
  Gift,
  ArrowRight,
  ArrowLeft,
  Flame,
  Clock,
  Check,
  Award
} from 'lucide-react';
import { ReferralStats, CurrencyType, UserAccount } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  currency: CurrencyType;
  onUpdateUser: (u: UserAccount) => void;
  onOpenSignUp?: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
}) => {
  const [activeTab, setActiveTab] = useState<'streak' | 'affiliate'>('streak');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimedSuccess, setClaimedSuccess] = useState<string | null>(null);

  // 7-Day Streak Local State
  const [claimedDays, setClaimedDays] = useState<number[]>([1, 2]);
  const currentStreakDay = 3;

  // Daily Missions State
  const [missions, setMissions] = useState([
    { id: 1, title: 'Play 3 Bingo Games', current: 2, target: 3, reward: 15, claimed: false },
    { id: 2, title: 'Win 1 Full House in Any Room', current: 1, target: 1, reward: 50, claimed: false },
    { id: 3, title: 'Invite 1 New Friend', current: 1, target: 1, reward: 25, claimed: true },
  ]);

  useEffect(() => {
    if (isOpen && user?.playerId) {
      fetch(apiUrl(`/api/referral/${user.playerId}`))
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch(console.error);
    }
  }, [isOpen, user?.playerId]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!stats && !user) return;
    const link = stats?.referralLink || (user?.playerId ? `https://t.me/BINGOBEET_BOT?start=BINGO_${user.playerId.slice(-4)}` : 'https://t.me/BINGOBEET_BOT');
    navigator.clipboard.writeText(link);
    setCopied(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaimDayReward = async (day: number, amount: number) => {
    if (claimedDays.includes(day) || day !== currentStreakDay) return;
    soundService.playJackpotFanfare();
    telegramSdk.triggerHaptic('success');
    setClaimedDays((prev) => [...prev, day]);
    setClaimedSuccess(`Claimed Day ${day} Streak Reward: +${amount} Birr!`);

    // Credit user
    if (user) {
      try {
        const res = await fetch(apiUrl('/api/wallet/deposit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: user.playerId, amount, paymentMethod: 'STREAK_REWARD' })
        });
        const data = await res.json();
        if (data.success && data.user) onUpdateUser(data.user);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClaimMission = async (missionId: number, reward: number) => {
    soundService.playLineChime();
    telegramSdk.triggerHaptic('success');
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, claimed: true } : m))
    );
    setClaimedSuccess(`Mission Complete! Claimed +${reward} Birr!`);

    if (user) {
      try {
        const res = await fetch(apiUrl('/api/wallet/deposit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: user.playerId, amount: reward, paymentMethod: 'MISSION_REWARD' })
        });
        const data = await res.json();
        if (data.success && data.user) onUpdateUser(data.user);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClaimAffiliate = async () => {
    if (!user?.playerId || !stats || stats.pendingClaimUSD <= 0) return;
    setClaiming(true);
    try {
      const res = await fetch(apiUrl('/api/referral/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: user.playerId })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        setClaimedSuccess(`Claimed ${(data.claimedAmountETB || (stats.pendingClaimETB || 150))} Birr commission to wallet!`);
        setStats((prev) => prev ? { ...prev, pendingClaimUSD: 0, pendingClaimETB: 0 } : null);
      }
    } catch (e) {
      soundService.playError();
      console.error(e);
    } finally {
      setClaiming(false);
    }
  };

  const streakDays = [
    { day: 1, amount: 5, label: '5 Birr' },
    { day: 2, amount: 10, label: '10 Birr' },
    { day: 3, amount: 15, label: '15 Birr' },
    { day: 4, amount: 25, label: '25 Birr' },
    { day: 5, amount: 35, label: '35 Birr' },
    { day: 6, amount: 50, label: '50 Birr' },
    { day: 7, amount: 100, label: '100B + 🎁 JACKPOT', special: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
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
                REWARDS & AFFILIATE
              </span>
              <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-[#E8FF00] text-black uppercase">
                EARN FREE BIRR
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#282828] text-white/60 hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95"
            title="Close Rewards"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#141414] border border-white/10">
          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('streak');
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase ${
              activeTab === 'streak'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>7-DAY STREAK & MISSIONS</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('affiliate');
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-arcade font-black uppercase ${
              activeTab === 'affiliate'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_12px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>5% AFFILIATE COMMISSIONS</span>
          </button>
        </div>

        {/* Claim Success Notification */}
        {claimedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-arcade text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{claimedSuccess}</span>
            </div>
            <button onClick={() => setClaimedSuccess(null)} className="font-bold px-1 text-emerald-400">✕</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 1: 7-DAY STREAK REWARDS & DAILY MISSIONS       */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'streak' && (
          <div className="space-y-4">
            {/* 7-Day Streak Card */}
            <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-[#E8FF00] fill-[#E8FF00]" />
                    <span className="font-arcade font-black text-xs uppercase text-white">
                      7-DAY LOGIN STREAK
                    </span>
                  </div>
                  <p className="text-[10px] font-arcade text-white/50 mt-0.5">
                    Log in every 24h to claim guaranteed Birr bonuses!
                  </p>
                </div>
                <span className="font-arcade font-black text-xs px-2.5 py-1 rounded-lg bg-[#E8FF00] text-black">
                  DAY {currentStreakDay} / 7
                </span>
              </div>

              {/* 7-Day Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-1">
                {streakDays.map((s) => {
                  const isClaimed = claimedDays.includes(s.day);
                  const isCurrent = s.day === currentStreakDay && !isClaimed;
                  const isLocked = s.day > currentStreakDay;

                  return (
                    <div
                      key={s.day}
                      className={`p-2 rounded-xl text-center flex flex-col justify-between border transition-all ${
                        s.special ? 'col-span-2 sm:col-span-1' : ''
                      } ${
                        isClaimed
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : isCurrent
                          ? 'bg-[#181818] border-2 border-[#E8FF00] text-white shadow-[0_0_15px_rgba(232,255,0,0.3)] animate-pulse'
                          : 'bg-[#141414] border-white/5 text-white/40'
                      }`}
                    >
                      <div className="text-[8px] font-arcade font-bold uppercase">DAY {s.day}</div>
                      <div className="font-arcade font-black text-xs my-1 text-[#E8FF00]">
                        {s.amount}B
                      </div>

                      {isClaimed ? (
                        <span className="text-[8px] font-arcade font-black text-emerald-400 py-0.5 rounded bg-emerald-500/20">
                          DONE ✓
                        </span>
                      ) : isCurrent ? (
                        <button
                          onClick={() => handleClaimDayReward(s.day, s.amount)}
                          className="btn-neon text-[8px] font-arcade font-black uppercase py-0.5 rounded cursor-pointer"
                        >
                          CLAIM
                        </button>
                      ) : (
                        <span className="text-[8px] font-arcade text-white/30 py-0.5">
                          LOCKED
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily Missions */}
            <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-arcade font-black text-xs uppercase text-white">
                  DAILY ARCADE MISSIONS
                </span>
                <span className="text-[10px] font-arcade text-white/50 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#E8FF00]" />
                  RESETS IN 14H
                </span>
              </div>

              <div className="space-y-2">
                {missions.map((m) => {
                  const isReadyToClaim = m.current >= m.target && !m.claimed;
                  const percent = Math.min(100, Math.round((m.current / m.target) * 100));

                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-[#161616] border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-arcade font-black text-white truncate">{m.title}</span>
                          <span className="font-arcade font-black text-[#E8FF00]">+{m.reward} BIRR</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-1.5 rounded-full bg-[#202020] mt-2 overflow-hidden">
                          <div
                            className="h-full bg-[#E8FF00] rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-arcade text-white/40 mt-1">
                          <span>Progress: {m.current}/{m.target}</span>
                          <span>{percent}%</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {m.claimed ? (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-arcade font-black bg-white/5 text-white/40">
                            CLAIMED
                          </span>
                        ) : isReadyToClaim ? (
                          <button
                            onClick={() => handleClaimMission(m.id, m.reward)}
                            className="btn-neon px-3 py-1 text-[9px] font-arcade font-black rounded-full cursor-pointer active:scale-95 animate-pulse"
                          >
                            CLAIM
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-arcade text-white/30 bg-white/5">
                            IN PROGRESS
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 2: AFFILIATE 5% REVENUE SHARE                  */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'affiliate' && (
          <div className="space-y-4">
            {/* Giant 5% Commission Hero Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1c1c1c] to-[#111111] border-2 border-[#E8FF00]/40 text-center space-y-2 shadow-[0_0_20px_rgba(232,255,0,0.15)]">
              <span className="text-[10px] font-arcade font-bold text-white/60 uppercase tracking-widest block">
                AFFILIATE REVENUE SHARE
              </span>
              <div className="font-arcade font-black text-3xl sm:text-4xl text-[#E8FF00] leading-none drop-shadow-[0_0_12px_rgba(232,255,0,0.4)]">
                EARN 5% FOR LIFE
              </div>
              <p className="text-xs font-arcade text-white/70 max-w-xs mx-auto">
                Get paid 5% instantly on every single ticket your invited friends purchase, forever!
              </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-[#111111] border border-white/10 text-center">
                <span className="text-[8px] font-arcade text-white/50 uppercase block">Invited</span>
                <span className="font-arcade font-black text-lg text-white mt-0.5 block">
                  {stats?.totalInvited || 18}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#111111] border border-white/10 text-center">
                <span className="text-[8px] font-arcade text-white/50 uppercase block">Active</span>
                <span className="font-arcade font-black text-lg text-emerald-400 mt-0.5 block">
                  {stats?.activeReferrals || 12}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#111111] border border-white/10 text-center">
                <span className="text-[8px] font-arcade text-white/50 uppercase block">Total Earned</span>
                <span className="font-arcade font-black text-lg text-[#E8FF00] mt-0.5 block">
                  {(stats?.totalEarnedETB || 645).toLocaleString()}B
                </span>
              </div>
            </div>

            {/* One-Tap Copy Invite Link */}
            <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2.5">
              <span className="text-xs font-arcade font-black uppercase text-white block">
                YOUR UNIQUE INVITE LINK
              </span>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-[#161616] border border-white/10">
                <input
                  type="text"
                  readOnly
                  value={
                    stats?.referralLink ||
                    (typeof window !== 'undefined'
                      ? `${window.location.origin}?ref=BINGO_${(user?.playerId || 'me').slice(-4)}`
                      : `https://bingo-betting.app?ref=BINGO_${(user?.playerId || 'me').slice(-4)}`)
                  }
                  className="bg-transparent text-xs font-mono text-white/70 w-full outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className="btn-neon px-3 py-1.5 rounded-lg text-xs font-arcade font-black uppercase flex items-center gap-1 cursor-pointer flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            {/* Claim Commissions Box */}
            <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-arcade text-white/50 uppercase block">
                  PENDING COMMISSIONS
                </span>
                <div className="font-arcade font-black text-xl text-[#E8FF00]">
                  {(stats?.pendingClaimETB || 150).toLocaleString()} BIRR
                </div>
              </div>

              <button
                onClick={handleClaimAffiliate}
                disabled={claiming || !stats || stats.pendingClaimUSD <= 0}
                className="btn-neon px-5 py-2.5 rounded-xl font-arcade font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{claiming ? 'CLAIMING...' : 'CLAIM TO WALLET'}</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  </div>
  );
};
