import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  X,
  Gift,
  Users,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  ShieldCheck,
  Share2,
  Award,
} from 'lucide-react';
import {
  CurrencyType,
  UserAccount,
  UserRewardsSummary,
  RoomPlayRewardStatus,
} from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';
import { ModalHeader } from './ModalHeader.js';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  currency?: CurrencyType;
  onUpdateUser: (u: UserAccount) => void;
  onOpenSignUp?: () => void;
  onClaimSuccess?: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onClaimSuccess,
}) => {
  const [summary, setSummary] = useState<UserRewardsSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'deposit' | 'rooms' | 'referrals'>('all');
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRewards = useCallback(async () => {
    if (!user?.playerId) return;
    try {
      const token = localStorage.getItem('bingo_auth_token') || localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/rewards'), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data: UserRewardsSummary = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('[RewardsModal] Failed to fetch rewards:', err);
    }
  }, [user?.playerId]);

  useEffect(() => {
    if (isOpen) {
      fetchRewards();
      setNotification(null);
    }
  }, [isOpen, fetchRewards]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const link = summary?.referralRewards.referralLink ||
      (user?.playerId ? `https://t.me/BINGOBEET_BOT?start=BINGO_${user.playerId.slice(-4)}` : 'https://t.me/BINGOBEET_BOT');
    navigator.clipboard.writeText(link);
    setCopied(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    const link = summary?.referralRewards.referralLink || 'https://t.me/BINGOBEET_BOT';
    const text = encodeURIComponent('🎉 Play 75-Ball Bingo on Telegram and win real Birr! Get 10% first-deposit bonus & play rewards:');
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`;
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');
    window.open(url, '_blank');
  };

  const handleClaim = async (rewardType: 'FIRST_DEPOSIT' | 'ROOM_PLAY' | 'REFERRAL', roomId?: string) => {
    const key = roomId ? `${rewardType}:${roomId}` : rewardType;
    setClaimingKey(key);
    setNotification(null);

    try {
      const token = localStorage.getItem('bingo_auth_token') || localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/rewards/claim'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rewardType, roomId })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        setNotification({
          type: 'success',
          message: `Claimed +${data.claimResult.rewardAmount} ETB Bonus Balance!`
        });

        if (data.summary) {
          setSummary(data.summary);
          if (user) {
            onUpdateUser({
              ...user,
              bonusBalance: data.summary.bonusBalance
            });
          }
        } else {
          fetchRewards();
        }
        if (onClaimSuccess) {
          onClaimSuccess();
        }
      } else {
        soundService.playError();
        telegramSdk.triggerHaptic('warning');
        setNotification({
          type: 'error',
          message: data.error || 'Failed to claim reward'
        });
      }
    } catch (err: any) {
      soundService.playError();
      setNotification({
        type: 'error',
        message: err.message || 'Network error claiming reward'
      });
    } finally {
      setClaimingKey(null);
    }
  };

  const currentBonus = summary?.bonusBalance ?? user?.bonusBalance ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header (matches WalletModal and LeaderboardModal) */}
        <ModalHeader
          title="REWARDS CENTER"
          badge="BONUS HUB"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Rewards"
        />

        {/* Compact Notification Toast */}
        {notification && (
          <div className={`mx-5 mt-3 p-2.5 rounded-xl border text-xs flex items-center justify-between font-arcade ${
            notification.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-white/40 hover:text-white ml-2 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 w-full">
          {/* 1. SEPARATED BALANCE SUMMARY (matches WalletModal) */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-arcade font-bold text-white/50 uppercase tracking-widest">
                YOUR REWARD BALANCES
              </span>
              <button
                onClick={() => {
                  soundService.playClick();
                  fetchRewards();
                }}
                className="p-1 rounded-lg bg-[#181818] text-white/60 hover:text-white cursor-pointer"
                title="Refresh Rewards"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Bonus Balance */}
              <div className="p-2.5 rounded-xl bg-[#161616] border border-amber-500/30 text-left">
                <span className="text-[9px] font-arcade font-bold text-amber-400/80 uppercase block">
                  Bonus Balance
                </span>
                <span className="font-arcade font-black text-lg sm:text-xl text-amber-400 tracking-tight block truncate">
                  {currentBonus.toFixed(2)} ETB
                </span>
                <span className="text-[8px] font-arcade text-amber-300/70 block mt-0.5 whitespace-nowrap">
                  ● Bingo cards only
                </span>
              </div>

              {/* Cash Balance */}
              <div className="p-2.5 rounded-xl bg-[#161616] border border-white/10 text-left">
                <span className="text-[9px] font-arcade font-bold text-white/50 uppercase block">
                  Cash Balance
                </span>
                <span className="font-arcade font-black text-lg sm:text-xl text-[#E8FF00] tracking-tight block truncate">
                  {(user?.walletBalance || 0).toFixed(2)} ETB
                </span>
                <span className="text-[8px] font-arcade text-emerald-400 block mt-0.5 whitespace-nowrap">
                  ● Withdrawable
                </span>
              </div>
            </div>

            {/* Total Playable Balance */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs font-arcade">
              <span className="text-white/50 uppercase tracking-wide text-[10px] whitespace-nowrap">Total Playable:</span>
              <span className="font-black text-white text-sm font-arcade whitespace-nowrap">
                {((user?.walletBalance || 0) + currentBonus).toFixed(2)} ETB
              </span>
            </div>

            {/* Authoritative Bonus Restriction Banner */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-start gap-2 text-left">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug">
                <strong className="text-amber-300">Authoritative Rule:</strong> Use bonus balance to purchase Bingo cards. Bonus balance cannot be withdrawn, transferred, or converted to cash.
              </span>
            </div>
          </div>

          {/* 2. TAB SWITCHER (matches WalletModal / LeaderboardModal) */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#141414] border border-white/10">
            {[
              { id: 'all', label: 'OVERVIEW' },
              { id: 'deposit', label: 'DEPOSIT' },
              { id: 'rooms', label: 'ROOMS' },
              { id: 'referrals', label: 'INVITE' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  soundService.playClick();
                  setActiveTab(t.id as any);
                }}
                className={`py-2 px-1 text-[10px] sm:text-xs rounded-lg transition-all flex items-center justify-center font-arcade font-black uppercase cursor-pointer whitespace-nowrap min-w-0 ${
                  activeTab === t.id
                    ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="truncate whitespace-nowrap">{t.label}</span>
              </button>
            ))}
          </div>

          {/* 3. FIRST DEPOSIT REWARD (10% MAX 50 ETB) */}
          {(activeTab === 'all' || activeTab === 'deposit') && (
            <div className="space-y-2">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                1. FIRST DEPOSIT REWARD (10% BONUS)
              </span>
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 text-[#E8FF00] flex items-center justify-center shrink-0">
                      <Gift className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="font-arcade font-black text-xs text-white">10% FIRST DEPOSIT BONUS</div>
                      <div className="text-[10px] font-arcade text-white/40">Max: 50 ETB • 100 ETB → +10, 500 ETB → +50</div>
                    </div>
                  </div>

                  {summary?.firstDeposit.status === 'CLAIMED' ? (
                    <span className="text-[8px] font-arcade font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> CLAIMED
                    </span>
                  ) : summary?.firstDeposit.status === 'CLAIMABLE' ? (
                    <span className="text-[8px] font-arcade font-bold px-2 py-0.5 rounded-full bg-[#E8FF00] text-black">
                      READY
                    </span>
                  ) : (
                    <span className="text-[8px] font-arcade font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/40">
                      NOT ELIGIBLE
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                    <span className="text-[9px] font-arcade font-bold text-white/40 uppercase block">Qualifying Deposit</span>
                    <span className="font-arcade font-black text-sm text-white block mt-0.5">
                      {summary?.firstDeposit.qualifyingDepositAmount ? `${summary.firstDeposit.qualifyingDepositAmount.toFixed(2)} ETB` : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                    <span className="text-[9px] font-arcade font-bold text-white/40 uppercase block">Reward Amount</span>
                    <span className="font-arcade font-black text-sm text-[#E8FF00] block mt-0.5">
                      {summary?.firstDeposit.rewardAmount ? `+${summary.firstDeposit.rewardAmount.toFixed(2)} ETB` : 'Up to 50 ETB'}
                    </span>
                  </div>
                </div>

                {summary?.firstDeposit.status === 'CLAIMABLE' ? (
                  <button
                    onClick={() => handleClaim('FIRST_DEPOSIT')}
                    disabled={claimingKey === 'FIRST_DEPOSIT'}
                    className="w-full py-2.5 rounded-xl bg-[#E8FF00] hover:bg-[#d4ea00] text-black font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(232,255,0,0.3)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{claimingKey === 'FIRST_DEPOSIT' ? 'CLAIMING...' : `CLAIM ${summary.firstDeposit.rewardAmount.toFixed(2)} ETB BONUS`}</span>
                  </button>
                ) : summary?.firstDeposit.status === 'CLAIMED' ? (
                  <div className="text-center py-1 text-[10px] font-arcade text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>First deposit bonus has been claimed into bonus balance</span>
                  </div>
                ) : (
                  <div className="text-center py-1 text-[10px] font-arcade text-white/40">
                    Make your first deposit to earn 10% bonus (up to 50 ETB)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. ROOM PLAY REWARDS (10 CARDS = 1 CARD PRICE) */}
          {(activeTab === 'all' || activeTab === 'rooms') && (
            <div className="space-y-2">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                2. ROOM PLAY REWARDS (10 CARDS = 1 CARD PRICE)
              </span>
              <div className="space-y-2">
                {summary?.roomRewards && summary.roomRewards.length > 0 ? (
                  summary.roomRewards.map((room: RoomPlayRewardStatus) => {
                    const isClaimable = room.availableBlocks > 0;
                    const percent = Math.min(100, Math.round((room.progress / 10) * 100));

                    return (
                      <div
                        key={room.roomId}
                        className="p-3.5 rounded-2xl bg-[#111111] hover:bg-[#161616] border border-white/10 space-y-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-arcade font-black text-white text-xs">{room.roomName}</span>
                            <span className="text-[8px] font-arcade px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                              {room.cardPrice} ETB ROOM
                            </span>
                          </div>
                          <div className="font-arcade text-xs">
                            {isClaimable ? (
                              <span className="text-[#E8FF00] font-black">
                                +{room.availableRewardAmount} ETB READY ({room.availableBlocks}x)
                              </span>
                            ) : (
                              <span className="text-white/40 text-[10px]">
                                NEXT: {room.cardPrice} ETB
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Compact Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#E8FF00] transition-all duration-300"
                              style={{ width: `${Math.min(100, (room.progress / 10) * 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-arcade text-white/40">
                            <span>{room.progress} / 10 CARDS</span>
                            <span>TOTAL PLAYED: {room.cardsPurchased}</span>
                          </div>
                        </div>

                        {isClaimable && (
                          <button
                            onClick={() => handleClaim('ROOM_PLAY', room.roomId)}
                            disabled={claimingKey === `ROOM_PLAY:${room.roomId}`}
                            className="w-full py-2.5 rounded-xl bg-[#E8FF00] hover:bg-[#d4ea00] text-black font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(232,255,0,0.3)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{claimingKey === `ROOM_PLAY:${room.roomId}` ? 'CLAIMING...' : `CLAIM ${room.availableRewardAmount} ETB BONUS`}</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-xl bg-[#111111] border border-white/10 text-center text-xs text-white/40 font-arcade">
                    Loading room rewards...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. REFERRAL REWARDS (10 ETB PER DEPOSIT) */}
          {(activeTab === 'all' || activeTab === 'referrals') && (
            <div className="space-y-2">
              <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
                3. REFERRAL REWARDS (10 ETB PER DEPOSIT)
              </span>
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="font-arcade font-black text-xs text-white">INVITE NEW PLAYERS</div>
                      <div className="text-[10px] font-arcade text-white/40">10 ETB per friend after their qualifying deposit</div>
                    </div>
                  </div>
                  <span className="text-[8px] font-arcade font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    10 ETB / DEPOSIT
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                    <span className="text-[8px] font-arcade text-white/40 uppercase block">Total Invited</span>
                    <span className="font-arcade font-black text-sm text-white mt-0.5 block">
                      {summary?.referralRewards.totalInvited || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                    <span className="text-[8px] font-arcade text-white/40 uppercase block">Deposited</span>
                    <span className="font-arcade font-black text-sm text-emerald-400 mt-0.5 block">
                      {summary?.referralRewards.qualifiedCount || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                    <span className="text-[8px] font-arcade text-white/40 uppercase block">Available</span>
                    <span className="font-arcade font-black text-sm text-[#E8FF00] mt-0.5 block">
                      {summary?.referralRewards.availableRewardAmount || 0} ETB
                    </span>
                  </div>
                </div>

                {summary && summary.referralRewards.availableRewardAmount > 0 && (
                  <button
                    onClick={() => handleClaim('REFERRAL')}
                    disabled={claimingKey === 'REFERRAL'}
                    className="w-full py-2.5 rounded-xl bg-[#E8FF00] hover:bg-[#d4ea00] text-black font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(232,255,0,0.3)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{claimingKey === 'REFERRAL' ? 'CLAIMING...' : `CLAIM ${summary.referralRewards.availableRewardAmount.toFixed(2)} ETB BONUS`}</span>
                  </button>
                )}

                {/* Share Link Row */}
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2.5 rounded-xl bg-[#161616] border border-white/10 text-[10px] font-mono text-white/70 truncate">
                      {summary?.referralRewards.referralLink || 'https://t.me/BINGOBEET_BOT'}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-2.5 rounded-xl bg-[#202020] hover:bg-[#282828] border border-white/10 text-xs font-arcade font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                      title="Copy Link"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleShareTelegram}
                    className="w-full py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-white/10 font-arcade font-black text-xs uppercase flex items-center justify-center gap-1.5 text-white cursor-pointer active:scale-95"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#E8FF00]" />
                    <span>SHARE INVITE LINK ON TELEGRAM</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 6. REWARD CLAIM HISTORY (matches WalletModal ledger list) */}
          <div className="space-y-2">
            <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-1">
              REWARD CLAIM HISTORY
            </span>
            {summary?.history && summary.history.length > 0 ? (
              <div className="space-y-1.5">
                {summary.history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-[#111111] hover:bg-[#161616] border border-white/10 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/10 border border-[#E8FF00]/20 text-[#E8FF00] flex items-center justify-center shrink-0">
                        <Award className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="font-arcade font-black text-xs text-white truncate">
                          {item.rewardType === 'FIRST_DEPOSIT'
                            ? 'First Deposit Bonus'
                            : item.rewardType === 'ROOM_PLAY'
                            ? 'Room Play Reward'
                            : 'Referral Bonus'}
                        </div>
                        <div className="text-[9px] font-arcade text-white/40 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(item.claimedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-arcade font-black text-xs text-[#E8FF00]">
                        +{(item.amount ?? (item as any).rewardAmount ?? 0).toFixed(2)} ETB
                      </div>
                      <span className="text-[8px] font-arcade text-emerald-400">
                        ● Credited
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#111111] border border-white/10 text-center text-xs text-white/40 font-arcade">
                No claimed rewards yet.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
