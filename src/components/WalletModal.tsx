import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Sparkles,
  X,
  RefreshCw,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Phone,
  Clock,
  Copy,
  Check
} from 'lucide-react';
import { UserAccount, LedgerEntry, PromotionalReward, PaymentAccount } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';
import { ModalHeader } from './ModalHeader.js';

export function sanitizePaymentError(rawError?: string, defaultMsg: string = 'Your payment request could not be processed. Please try again.'): string {
  if (!rawError || typeof rawError !== 'string') return defaultMsg;
  const lower = rawError.toLowerCase();
  if (
    lower.includes('constraint failed') ||
    lower.includes('sqlite') ||
    lower.includes('check constraint') ||
    lower.includes('syntaxerror') ||
    lower.includes('table ') ||
    lower.includes('column ')
  ) {
    return defaultMsg;
  }
  return rawError;
}

interface WalletModalProps {
  isOpen: boolean;
  initialTab?: 'deposit' | 'withdraw' | 'history';
  onClose: () => void;
  user: UserAccount | null;
  onUpdateUser: (user: UserAccount) => void;
  onOpenSignUp?: () => void;
  onOpenLogin?: () => void;
  socket?: any;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  initialTab = 'deposit',
  onClose,
  user,
  onUpdateUser,
  socket,
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>(initialTab);
  const [depositAmount, setDepositAmount] = useState<number | ''>(100);
  const [telebirrReference, setTelebirrReference] = useState<string>('');
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const [withdrawAddress, setWithdrawAddress] = useState<string>(user?.phone || '');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'deposit' | 'win_payout' | 'withdrawal'>('all');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePaymentAccount, setActivePaymentAccount] = useState<PaymentAccount | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [activeBonusData, setActiveBonusData] = useState<{
    bonusBalance: number;
    cashBalance: number;
    totalPlayableBalance: number;
    activeReward: PromotionalReward | null;
    timeRemainingSeconds: number;
  } | null>(null);

  const fetchActivePaymentAccount = async () => {
    try {
      const res = await fetch(apiUrl('/api/payment/active-account'));
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.account) {
          setActivePaymentAccount(data.account);
        }
      }
    } catch (e) {
      // Non-blocking
    }
  };

  const fetchBonus = async () => {
    try {
      const token = localStorage.getItem('bingo_auth_token');
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(apiUrl('/api/rewards/my-bonus'), { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveBonusData(data);
        }
      }
    } catch (e) {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      fetchActivePaymentAccount();
      if (user?.playerId) {
        fetchLedger();
        fetchBonus();
      }
      if (user?.phone) setWithdrawAddress(user.phone);
    }
  }, [isOpen, initialTab, user?.playerId, user?.phone, user?.walletBalance, user?.bonusBalance]);

  // Real-time active payment account update
  useEffect(() => {
    if (!socket) return;
    const onActivePayment = (account: PaymentAccount | null) => {
      if (account) {
        setActivePaymentAccount(account);
      }
    };
    socket.on('payment:active', onActivePayment);
    return () => {
      socket.off('payment:active', onActivePayment);
    };
  }, [socket]);

  useEffect(() => {
    if (!activeBonusData || activeBonusData.timeRemainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setActiveBonusData(prev => {
        if (!prev || prev.timeRemainingSeconds <= 0) return prev;
        return { ...prev, timeRemainingSeconds: prev.timeRemainingSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBonusData?.timeRemainingSeconds]);

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  if (!isOpen) return null;

  const fetchLedger = async () => {
    if (!user?.playerId) return;
    try {
      const res = await fetch(apiUrl(`/api/ledger/${user.playerId}`));
      if (res.ok) {
        const data = await res.json();
        setLedgerEntries(data.entries || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeposit = async () => {
    const numAmount = typeof depositAmount === 'number' ? depositAmount : 0;
    if (!user?.playerId || numAmount < 10) {
      soundService.playError();
      setErrorMsg('Minimum deposit amount is 10 Birr');
      return;
    }
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem('bingo_auth_token');
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(apiUrl('/api/wallet/deposit'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          playerId: user.playerId,
          amount: numAmount,
          paymentMethod: 'Telebirr',
          referenceId: telebirrReference.trim() || undefined,
          telebirrReference: telebirrReference.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.user) {
          onUpdateUser(data.user);
        }
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        setSuccessMsg(`Deposit request of ${numAmount.toLocaleString()} Birr submitted via Telebirr! Pending admin verification.`);
        setTelebirrReference('');
        fetchLedger();
      } else {
        soundService.playError();
        setErrorMsg(sanitizePaymentError(data.error, 'Failed to submit deposit request. Please try again.'));
      }
    } catch (e: any) {
      soundService.playError();
      setErrorMsg(sanitizePaymentError(e.message, 'Network error submitting deposit'));
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const numAmount = typeof withdrawAmount === 'number' ? withdrawAmount : 0;
    if (!user?.playerId || numAmount < 10 || numAmount > (user.walletBalance || 0)) {
      soundService.playError();
      setErrorMsg(numAmount < 10 ? 'Minimum withdrawal is 10 Birr' : 'Insufficient available balance');
      return;
    }
    if (!withdrawAddress.trim()) {
      soundService.playError();
      setErrorMsg('Please enter your Telebirr phone number (09... or 07...)');
      return;
    }
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem('bingo_auth_token');
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(apiUrl('/api/wallet/withdraw'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          playerId: user.playerId,
          amount: numAmount,
          address: withdrawAddress.trim(),
          withdrawAddress: withdrawAddress.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.user) {
          onUpdateUser(data.user);
        }
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        setSuccessMsg(`Withdrawal request of ${numAmount.toLocaleString()} Birr submitted for Telebirr payout! Balance reserved pending review.`);
        setWithdrawAmount('');
        fetchLedger();
      } else {
        soundService.playError();
        setErrorMsg(sanitizePaymentError(data.error, 'Failed to submit withdrawal request. Please try again.'));
      }
    } catch (e: any) {
      soundService.playError();
      setErrorMsg(sanitizePaymentError(e.message, 'Network error submitting withdrawal'));
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const currentBalance = user?.walletBalance || 0;
  const numDeposit = typeof depositAmount === 'number' ? depositAmount : 0;
  const presetAmounts = [50, 100, 250, 500];

  const filteredLedger = ledgerEntries.filter((entry) => {
    if (ledgerFilter === 'all') return true;
    return entry.type === ledgerFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="BINGO CASHIER"
          badge="TELEBIRR ONLY"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Cashier"
        />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 w-full">
        {/* 1. SEPARATED BALANCE DISPLAY */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2.5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-arcade font-bold text-white/50 uppercase tracking-widest">
              YOUR WALLET BALANCES
            </span>
            <button
              onClick={() => {
                soundService.playClick();
                fetchLedger();
                fetchBonus();
              }}
              className="p-1 rounded-lg bg-[#181818] text-white/60 hover:text-white cursor-pointer"
              title="Refresh Balance"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Cash Balance */}
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/10 text-left">
              <span className="text-[9px] font-arcade font-bold text-white/50 uppercase block">
                Cash Balance
              </span>
              <span className="font-arcade font-black text-lg sm:text-xl text-[#E8FF00] tracking-tight block truncate">
                {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
              </span>
              <span className="text-[8px] font-arcade text-emerald-400 block mt-0.5 whitespace-nowrap">
                ● Withdrawable
              </span>
            </div>

            {/* Promotional Bonus */}
            <div className="p-2.5 rounded-xl bg-[#161616] border border-amber-500/30 text-left relative">
              <span className="text-[9px] font-arcade font-bold text-amber-400/80 uppercase block flex items-center justify-between">
                <span>Bonus Balance</span>
                {activeBonusData && activeBonusData.timeRemainingSeconds > 0 ? (
                  <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono whitespace-nowrap shrink-0">
                    {formatCountdown(activeBonusData.timeRemainingSeconds)}
                  </span>
                ) : null}
              </span>
              <span className="font-arcade font-black text-lg sm:text-xl text-amber-400 tracking-tight block truncate">
                {((user?.bonusBalance ?? activeBonusData?.bonusBalance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
              </span>
              <span className="text-[8px] font-arcade text-amber-300/80 block mt-0.5 whitespace-nowrap">
                ● Bingo Cards Only
              </span>
            </div>
          </div>

          {/* Total Playable Balance */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs font-arcade">
            <span className="text-white/50 uppercase tracking-wide text-[10px] whitespace-nowrap">Total Playable:</span>
            <span className="font-black text-white text-sm font-arcade whitespace-nowrap">
              {(currentBalance + ((user?.bonusBalance ?? activeBonusData?.bonusBalance) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
            </span>
          </div>

          {/* Bonus Active Notice */}
          {((user?.bonusBalance ?? activeBonusData?.bonusBalance) || 0) > 0 && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-200/90 flex items-start gap-1.5 text-left">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>10% Promotional Bonus Active:</strong> Use for Bingo & Weekend Jackpot card purchases. Non-withdrawable. Expires exactly 24h after issuance.
              </span>
            </div>
          )}
        </div>

        {/* 2. TAB SWITCHER */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#141414] border border-white/10">
          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('deposit');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`py-2 px-1 text-[11px] sm:text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase whitespace-nowrap min-w-0 ${
              activeTab === 'deposit'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-[3] shrink-0" />
            <span className="truncate whitespace-nowrap">DEPOSIT</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('withdraw');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`py-2 px-1 text-[11px] sm:text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase whitespace-nowrap min-w-0 ${
              activeTab === 'withdraw'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[3] shrink-0" />
            <span className="truncate whitespace-nowrap">WITHDRAW</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('history');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`py-2 px-1 text-[11px] sm:text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase whitespace-nowrap min-w-0 ${
              activeTab === 'history'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 stroke-[3] shrink-0" />
            <span className="truncate whitespace-nowrap">LEDGER</span>
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-arcade text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="font-bold px-1 text-emerald-400">✕</button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400 text-rose-300 font-arcade text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="font-bold px-1 text-rose-400">✕</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 1: DEPOSIT (TELEBIRR ONLY)                     */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'deposit' && (
          <div className="space-y-3.5">
            {/* Dedicated Telebirr Badge Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border-2 border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-black font-arcade font-black text-sm flex items-center justify-center shadow-lg">
                  TB
                </div>
                <div>
                  <div className="font-arcade font-black text-xs text-white uppercase tracking-wide">
                    PAY WITH TELEBIRR
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono font-medium">
                    Exclusive Mobile Money Gateway
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-arcade font-black px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                100% VERIFIED
              </span>
            </div>

            {/* Dynamic Active Telebirr Payment Card */}
            <div className="p-3.5 rounded-2xl bg-[#141414] border border-emerald-500/30 space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-arcade font-bold text-white/50 uppercase tracking-widest">
                  DEPOSIT VIA TELEBIRR
                </span>
                <span className="text-[9px] font-arcade font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ACTIVE NUMBER
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#1a1a1a] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-arcade font-bold text-white/40 uppercase">Send your payment to:</div>
                  <div className="font-arcade font-black text-xl text-[#E8FF00] tracking-wider select-all">
                    {activePaymentAccount?.phone_number || '0912345678'}
                  </div>
                  <div className="text-[10px] font-arcade text-white/70 mt-0.5">
                    Account Name: <strong className="text-white">{activePaymentAccount?.account_name || 'Official Platform Account'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const phoneToCopy = activePaymentAccount?.phone_number || '0912345678';
                    navigator.clipboard.writeText(phoneToCopy);
                    setCopiedPhone(true);
                    soundService.playClick();
                    setTimeout(() => setCopiedPhone(false), 2000);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-arcade font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-500/40"
                  title="Copy Phone Number"
                >
                  {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPhone ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>

              <div className="text-[11px] text-white/70 space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
                <div>{activePaymentAccount?.instructions || `1. Transfer ${numDeposit} ETB via Telebirr (*127# or Telebirr SuperApp) to the number above.`}</div>
                <div className="text-[10px] text-amber-300/90 font-arcade">
                  ● After completing the Telebirr payment, enter your transaction/reference number below.
                </div>
              </div>
            </div>

            {/* Fast Preset Deposit Buttons */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-arcade font-black text-white/60 uppercase">
                FAST PRESET AMOUNTS
              </span>
              <div className="grid grid-cols-4 gap-2">
                {presetAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      soundService.playClick();
                      setDepositAmount(amt);
                    }}
                    className={`py-2 rounded-xl font-arcade font-black text-xs transition-all cursor-pointer ${
                      depositAmount === amt
                        ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.4)]'
                        : 'bg-[#161616] border border-white/10 text-white hover:border-white/30'
                    }`}
                  >
                    +{amt} B
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-arcade font-black text-white/60 uppercase">
                DEPOSIT AMOUNT (ETB BIRR)
              </span>
              <div className="relative rounded-2xl bg-[#141414] border-2 border-[#E8FF00]/40 focus-within:border-[#E8FF00] p-3">
                <div className="flex items-center gap-3">
                  <span className="font-arcade font-black text-lg text-[#E8FF00]">ETB</span>
                  <input
                    type="number"
                    min={10}
                    max={50000}
                    value={depositAmount === '' ? '' : depositAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setDepositAmount('');
                      else setDepositAmount(parseInt(val, 10) || '');
                    }}
                    placeholder="100"
                    className="w-full bg-transparent font-arcade font-black text-2xl text-white outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Telebirr Reference ID Input */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-arcade font-black text-white/60 uppercase">
                TELEBIRR TRANSACTION REFERENCE / RECEIPT ID
              </span>
              <div className="relative rounded-2xl bg-[#141414] border-2 border-white/20 focus-within:border-[#E8FF00] p-3 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#E8FF00] shrink-0" />
                <input
                  type="text"
                  value={telebirrReference}
                  onChange={(e) => {
                    setTelebirrReference(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="e.g. CR1234567890 or TXN8877"
                  className="w-full bg-transparent font-arcade text-sm text-white outline-none uppercase tracking-wider"
                />
              </div>
              <span className="text-[9px] text-white/40 block">
                Found in your Telebirr SMS confirmation (Required for fast approval)
              </span>
            </div>

            {/* Deposit CTA */}
            <button
              onClick={handleDeposit}
              disabled={loading || numDeposit < 10}
              className="btn-neon w-full py-3.5 rounded-2xl text-xs font-arcade font-black uppercase tracking-wide cursor-pointer disabled:opacity-40"
            >
              {loading ? 'PROCESSING...' : `PAY WITH TELEBIRR (${numDeposit} BIRR)`}
            </button>

            {/* High Trust Badges */}
            <div className="flex items-center justify-center gap-2 text-center text-[10px] font-arcade text-white/40 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Telebirr Payout • 0% Fee • Single Authoritative Gateway</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 2: WITHDRAW (TELEBIRR ONLY)                    */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'withdraw' && (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border-2 border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-black font-arcade font-black text-sm flex items-center justify-center shadow-lg">
                  TB
                </div>
                <div>
                  <div className="font-arcade font-black text-xs text-white uppercase tracking-wide">
                    TELEBIRR WITHDRAWAL
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono font-medium">
                    Direct Payout to Telebirr Wallet
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-arcade font-black px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                AUTO-RESERVED
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-arcade font-black text-white/60 uppercase">
                TELEBIRR ACCOUNT PHONE NUMBER
              </label>
              <div className="rounded-xl bg-[#141414] border border-white/20 focus-within:border-[#E8FF00] p-2.5 flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#E8FF00]" />
                <input
                  type="tel"
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  placeholder="09xxxxxxxx or 07xxxxxxxx"
                  className="bg-transparent font-arcade text-xs text-white outline-none w-full"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-arcade font-black text-white/60 uppercase">
                  WITHDRAW AMOUNT (BIRR)
                </span>
                <button
                  onClick={() => setWithdrawAmount(Math.floor(currentBalance))}
                  className="font-arcade text-xs text-[#E8FF00] hover:underline cursor-pointer"
                >
                  MAX ({Math.floor(currentBalance)} B)
                </button>
              </div>

              <div className="rounded-2xl bg-[#141414] border-2 border-white/20 focus-within:border-[#E8FF00] p-3 flex items-center gap-3">
                <span className="font-arcade font-black text-lg text-[#E8FF00]">ETB</span>
                <input
                  type="number"
                  min={10}
                  max={Math.floor(currentBalance)}
                  value={withdrawAmount === '' ? '' : withdrawAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') setWithdrawAmount('');
                    else setWithdrawAmount(parseInt(val, 10) || '');
                  }}
                  placeholder="50"
                  className="w-full bg-transparent font-arcade font-black text-2xl text-white outline-none"
                />
              </div>
            </div>

            {/* Cash Only Notice */}
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-arcade text-white/60 space-y-1">
              <div className="flex justify-between items-center text-white/80 font-bold">
                <span>Withdrawable Cash Balance:</span>
                <span className="text-[#E8FF00] font-black">{currentBalance.toFixed(2)} ETB</span>
              </div>
              <p className="text-[9px] text-white/40 leading-relaxed">
                * Note: Only unrestricted cash balances may be withdrawn. Promotional bonus balances are strictly non-withdrawable.
              </p>
            </div>

            {/* Withdraw CTA */}
            <button
              onClick={handleWithdraw}
              disabled={loading || !withdrawAmount || withdrawAmount < 10 || withdrawAmount > currentBalance}
              className="btn-neon w-full py-3.5 rounded-2xl text-xs font-arcade font-black uppercase tracking-wide cursor-pointer disabled:opacity-40"
            >
              {loading ? 'PROCESSING...' : `WITHDRAW ${withdrawAmount || 0} BIRR VIA TELEBIRR`}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 3: LEDGER                                      */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block">
              RECENT WALLET TRANSACTIONS
            </span>

            {filteredLedger.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#111111] border border-white/10 text-center text-xs font-arcade text-white/40">
                No transactions recorded yet.
              </div>
            ) : (
              filteredLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                >
                  <div>
                    <div className="font-arcade font-black text-xs text-white capitalize">
                      {entry.type.replace('_', ' ')}
                    </div>
                    <div className="text-[9px] font-arcade text-white/40">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className={`font-arcade font-black text-xs ${
                    entry.type === 'win_payout' || entry.type === 'deposit' || entry.type === 'refund' || entry.type === 'bonus'
                      ? 'text-[#E8FF00]'
                      : 'text-rose-400'
                  }`}>
                    {entry.type === 'buy_in' || entry.type === 'withdrawal' || entry.type === 'escrow_hold' || entry.type === 'loss' ? '-' : '+'}
                    {((entry.amount ?? 0)).toLocaleString()} BIRR
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  </div>
);
};
