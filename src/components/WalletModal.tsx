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
  Clock
} from 'lucide-react';
import { UserAccount, LedgerEntry } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';

interface WalletModalProps {
  isOpen: boolean;
  initialTab?: 'deposit' | 'withdraw' | 'history';
  onClose: () => void;
  user: UserAccount | null;
  onUpdateUser: (user: UserAccount) => void;
  onOpenSignUp?: () => void;
  onOpenLogin?: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  initialTab = 'deposit',
  onClose,
  user,
  onUpdateUser,
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

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (user?.playerId) fetchLedger();
      if (user?.phone) setWithdrawAddress(user.phone);
    }
  }, [isOpen, initialTab, user?.playerId, user?.phone, user?.walletBalance]);

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
        setErrorMsg(data.error || 'Failed to submit deposit request');
      }
    } catch (e: any) {
      soundService.playError();
      setErrorMsg(e.message || 'Network error submitting deposit');
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
        setErrorMsg(data.error || 'Failed to submit withdrawal request');
      }
    } catch (e: any) {
      soundService.playError();
      setErrorMsg(e.message || 'Network error submitting withdrawal');
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
        <header className="relative z-20 w-full px-5 py-3.5 bg-[#161616]/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundService.playClick();
                onClose();
              }}
              className="w-8 h-8 rounded-xl bg-[#202020] hover:bg-[#282828] text-white/80 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="font-arcade font-black text-base text-white uppercase tracking-wider">
                BINGO CASHIER
              </span>
              <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-[#E8FF00] text-black uppercase">
                TELEBIRR ONLY
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#282828] text-white/60 hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95"
            title="Close Cashier"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {/* 1. CURRENT BALANCE DISPLAY */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 text-center space-y-1 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-arcade font-bold text-white/50 uppercase tracking-widest">
              CURRENT WALLET BALANCE
            </span>
            <button
              onClick={() => {
                soundService.playClick();
                fetchLedger();
              }}
              className="p-1 rounded-lg bg-[#181818] text-white/60 hover:text-white"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <div className="font-arcade font-black text-3xl sm:text-4xl text-[#E8FF00] tracking-tight drop-shadow-[0_0_15px_rgba(232,255,0,0.3)]">
            {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BIRR
          </div>

          <div className="flex items-center justify-center gap-2 text-[10px] font-arcade text-white/40">
            <span>PLAYER: <strong className="text-white">{user?.username}</strong></span>
            <span>•</span>
            <span className="text-emerald-400">● 100% READY TO PLAY</span>
          </div>
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
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase ${
              activeTab === 'deposit'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-[3]" />
            <span>DEPOSIT</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('withdraw');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase ${
              activeTab === 'withdraw'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[3]" />
            <span>WITHDRAW</span>
          </button>

          <button
            onClick={() => {
              soundService.playClick();
              setActiveTab('history');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer font-arcade font-black uppercase ${
              activeTab === 'history'
                ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 stroke-[3]" />
            <span>LEDGER</span>
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

            {/* Step-by-Step Instructions */}
            <div className="p-3 rounded-xl bg-[#161616] border border-white/10 space-y-1 text-[11px] text-white/70">
              <div className="text-[10px] font-arcade font-black text-[#E8FF00] uppercase">
                TELEBIRR PAYMENT INSTRUCTIONS:
              </div>
              <div>1. Transfer <strong className="text-white">{numDeposit} ETB</strong> via Telebirr (*127# or SuperApp).</div>
              <div>2. Enter the <strong className="text-[#E8FF00]">Telebirr Transaction Reference ID</strong> below.</div>
              <div>3. Tap Submit. Funds are credited immediately once verified.</div>
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

            <button
              onClick={handleWithdraw}
              disabled={loading || !withdrawAmount || withdrawAmount <= 0 || withdrawAmount > currentBalance}
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
                    entry.type === 'win_payout' || entry.type === 'deposit'
                      ? 'text-[#E8FF00]'
                      : 'text-rose-400'
                  }`}>
                    {entry.type === 'buy_in' ? '-' : '+'}
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
