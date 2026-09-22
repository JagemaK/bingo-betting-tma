import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  Sparkles,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wallet,
  Plus,
  ArrowRight,
  RefreshCw,
  Star
} from 'lucide-react';
import { UserAccount, DailyJackpotPublicState, DailyJackpotCardCatalogItem, BingoGrid } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';

interface DailyJackpotEntryViewProps {
  user: UserAccount | null;
  token?: string;
  dailyJackpotState?: DailyJackpotPublicState | null;
  onBack: () => void;
  onOpenDeposit: () => void;
  onOpenSignUp?: () => void;
  onOpenAdmin?: () => void;
  onUpdateUser?: (user: UserAccount) => void;
  onTicketPurchased?: () => void;
}

const CARD_PRICE = 999;
const MAX_CARDS = 200;
const MIN_CARDS = 100;

const COL_NAMES: Array<'B' | 'I' | 'N' | 'G' | 'O'> = ['B', 'I', 'N', 'G', 'O'];
const COL_STYLES = {
  B: { label: 'B', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  I: { label: 'I', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
  N: { label: 'N', color: '#E8FF00', bg: 'rgba(232, 255, 0, 0.12)', border: 'rgba(232, 255, 0, 0.3)' },
  G: { label: 'G', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)' },
  O: { label: 'O', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)' },
};

/**
 * Deterministic client-side card generator fallback (seeded by card number)
 * Matches standard 75-ball Bingo layout (B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75)
 */
function getDeterministicFallbackGrid(cardNum: number): BingoGrid {
  const colRanges = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
  };

  const grid: Partial<BingoGrid> = {};
  for (const col of COL_NAMES) {
    const [min, max] = colRanges[col];
    const totalInCol = max - min + 1;
    const count = col === 'N' ? 4 : 5;
    const nums: number[] = [];
    for (let i = 0; i < count; i++) {
      // Deterministic spread based on cardNum & column
      const step = Math.floor(totalInCol / count);
      const val = min + ((cardNum * 7 + i * step + col.charCodeAt(0)) % totalInCol);
      if (!nums.includes(val)) {
        nums.push(val);
      } else {
        let alt = min + ((val + 1) % totalInCol);
        while (nums.includes(alt)) alt = min + ((alt + 1) % totalInCol);
        nums.push(alt);
      }
    }
    nums.sort((a, b) => a - b);
    if (col === 'N') {
      nums.splice(2, 0, 0); // Free space in center
    }
    grid[col] = nums;
  }
  return grid as BingoGrid;
}

export const DailyJackpotEntryView: React.FC<DailyJackpotEntryViewProps> = ({
  user,
  token: propToken,
  dailyJackpotState: initialJackpotState,
  onBack,
  onOpenDeposit,
  onOpenSignUp,
  onOpenAdmin,
  onUpdateUser,
  onTicketPurchased
}) => {
  const [jackpotData, setJackpotData] = useState<DailyJackpotPublicState | null>(initialJackpotState || null);
  const [cards, setCards] = useState<DailyJackpotCardCatalogItem[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [previewCardNumber, setPreviewCardNumber] = useState<number>(1);
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'available' | 'selected' | 'my_cards'>('all');
  
  const [loading, setLoading] = useState<boolean>(true);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [timeRemainingStr, setTimeRemainingStr] = useState<string>('');

  // Resolved authoritative auth token
  const authToken = propToken || localStorage.getItem('bingo_auth_token') || '';

  // Load jackpot state and full cards catalog (including 5x5 grids)
  const loadJackpotData = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const [resState, resCards] = await Promise.all([
        fetch(apiUrl('/api/daily-jackpot/current'), { headers }),
        fetch(apiUrl('/api/daily-jackpot/cards'), { headers })
      ]);

      if (resState.ok) {
        const data: DailyJackpotPublicState = await resState.json();
        setJackpotData(data);
      }

      if (resCards.ok) {
        const cardData = await resCards.json();
        const catalog: DailyJackpotCardCatalogItem[] = cardData.cards || [];
        setCards(catalog);

        // If no card is previewed yet or card is taken, preview first available
        if (catalog.length > 0) {
          const firstAvailable = catalog.find(c => !c.isTaken) || catalog[0];
          setPreviewCardNumber(prev => {
            const exists = catalog.find(c => c.cardNumber === prev);
            return exists ? prev : firstAvailable.cardNumber;
          });
        }
      }
    } catch (err: any) {
      console.error('[DailyJackpotEntryView] Load error:', err);
      if (!silent) setErrorMsg('Failed to load Daily Grand Jackpot data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadJackpotData();
  }, [authToken]);

  // Countdown timer to 12:00 PM Addis Ababa
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const cutoffTarget = new Date();
      cutoffTarget.setUTCHours(9, 0, 0, 0); // 12:00 PM East Africa Time (UTC+3) is 09:00 UTC
      if (now.getTime() > cutoffTarget.getTime()) {
        cutoffTarget.setUTCDate(cutoffTarget.getUTCDate() + 1);
      }
      const diff = cutoffTarget.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeRemainingStr('00:00:00');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeRemainingStr(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Card selection logic
  const handleToggleCardSelection = (cardNum: number) => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');

    const card = cards.find(c => c.cardNumber === cardNum);
    if (card?.isTaken && !card.isOwnedByMe) {
      return; // Cannot select taken cards
    }

    // Always update preview to the clicked card
    setPreviewCardNumber(cardNum);

    if (card?.isOwnedByMe) {
      return; // Already owned, just view preview
    }

    setSelectedNumbers(prev => {
      if (prev.includes(cardNum)) {
        return prev.filter(n => n !== cardNum);
      } else {
        return [...prev, cardNum];
      }
    });
  };

  // Quick selection helpers
  const handleSelectFirstAvailable = (count: number) => {
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    const available = cards
      .filter(c => !c.isTaken && !c.isOwnedByMe)
      .map(c => c.cardNumber);

    const newSelection = available.slice(0, count);
    setSelectedNumbers(newSelection);
    if (newSelection.length > 0) {
      setPreviewCardNumber(newSelection[0]);
    }
  };

  const handleClearSelection = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setSelectedNumbers([]);
  };

  // Active preview card object
  const activeCardItem = useMemo(() => {
    return cards.find(c => c.cardNumber === previewCardNumber) || {
      cardNumber: previewCardNumber,
      isTaken: false,
      isOwnedByMe: false,
      price: CARD_PRICE,
      grid: getDeterministicFallbackGrid(previewCardNumber)
    };
  }, [cards, previewCardNumber]);

  // Transpose active card grid into row-major 5x5 matrix
  const activeGrid = activeCardItem.grid || getDeterministicFallbackGrid(activeCardItem.cardNumber);
  const matrix: number[][] = useMemo(() => {
    const cols = [activeGrid.B, activeGrid.I, activeGrid.N, activeGrid.G, activeGrid.O];
    const m: number[][] = [];
    for (let r = 0; r < 5; r++) {
      m[r] = [];
      for (let c = 0; c < 5; c++) {
        m[r].push(cols[c] ? cols[c][r] : 0);
      }
    }
    return m;
  }, [activeGrid]);

  // Derived financial & participation metrics
  const totalInvestment = selectedNumbers.length * CARD_PRICE;
  const userBalance = user?.walletBalance ?? (user as any)?.balance ?? 0;
  const hasEnoughBalance = userBalance >= totalInvestment;
  const cardsSold = jackpotData?.cardsSold ?? 0;
  const progressPercent = Math.min(100, Math.round((cardsSold / MAX_CARDS) * 100));
  const isPostponed = Boolean(jackpotData?.isPostponed || jackpotData?.status === 'POSTPONED');
  const jackpotDisplayAmount = (jackpotData?.jackpotAmount && jackpotData.jackpotAmount > 150000)
    ? jackpotData.jackpotAmount
    : 150000;

  // Filtered card list
  const displayedCards = useMemo(() => {
    switch (catalogFilter) {
      case 'available':
        return cards.filter(c => !c.isTaken);
      case 'selected':
        return cards.filter(c => selectedNumbers.includes(c.cardNumber));
      case 'my_cards':
        return cards.filter(c => c.isOwnedByMe);
      case 'all':
      default:
        return cards;
    }
  }, [cards, catalogFilter, selectedNumbers]);

  // Purchase Execution Flow
  const handleConfirmPurchase = async () => {
    if (selectedNumbers.length === 0) {
      setErrorMsg('Please select at least one card from the catalog');
      return;
    }

    if (!user) {
      if (onOpenSignUp) onOpenSignUp();
      return;
    }

    if (!hasEnoughBalance) {
      setErrorMsg(`Insufficient balance. You need ${totalInvestment.toLocaleString()} ETB.`);
      onOpenDeposit();
      return;
    }

    setPurchasing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = authToken || localStorage.getItem('bingo_auth_token') || '';
      const response = await fetch(apiUrl('/api/daily-jackpot/purchase'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ cardNumbers: selectedNumbers })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to purchase cards. Please try again.');
      }

      // Success sequence
      soundService.playJackpotFanfare();
      telegramSdk.triggerHaptic('heavy');
      setPurchaseSuccess(true);
      setSuccessMsg(`🎉 Successfully purchased ${selectedNumbers.length} card(s) for the Daily Grand Jackpot!`);

      // Update local and parent user balance
      if (result.user && onUpdateUser) {
        onUpdateUser(result.user);
      }

      if (onTicketPurchased) {
        onTicketPurchased();
      }

      // Clear selection
      setSelectedNumbers([]);

      // Refresh catalog to reflect owned tickets
      await loadJackpotData(true);

      setTimeout(() => {
        setPurchaseSuccess(false);
      }, 4000);
    } catch (err: any) {
      console.error('[DailyJackpotEntryView] Purchase failed:', err);
      soundService.playError();
      telegramSdk.triggerHaptic('error');
      setErrorMsg(err.message || 'Transaction failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080808] text-white flex flex-col font-sans selection:bg-[#E8FF00] selection:text-black">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP STICKY HEADER (Compact, Safe-Area Supported, Non-Obtrusive)    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-[#0c0c0c]/95 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_4px_25px_rgba(0,0,0,0.7)] pt-[max(0.375rem,env(safe-area-inset-top))] px-3 sm:px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          {/* Back Button + Title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
                onBack();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-[#161616] hover:bg-[#222222] border border-white/10 hover:border-[#E8FF00]/40 text-white active:scale-95 transition-all cursor-pointer flex items-center gap-1 shrink-0"
              title="Return to Lobby"
              aria-label="Back to Lobby"
            >
              <ChevronLeft className="w-5 h-5 text-[#E8FF00]" />
              <span className="font-arcade text-xs font-black uppercase text-white/80 pr-1 hidden xs:inline">
                BACK
              </span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-arcade font-black text-xs sm:text-sm text-white tracking-tight uppercase truncate">
                  DAILY GRAND JACKPOT
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-arcade font-bold uppercase tracking-wider shrink-0 ${
                  isPostponed
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 animate-pulse'
                }`}>
                  {isPostponed ? 'POSTPONED' : 'OPEN'}
                </span>
              </div>
              <div className="text-[10px] text-white/50 font-arcade flex items-center gap-1.5 truncate">
                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Cutoff: 12:00 PM Addis Ababa</span>
                <span className="text-amber-300 font-bold">• {timeRemainingStr || 'Countdown'}</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls: Wallet & Refresh */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Wallet Pill */}
            <button
              onClick={() => {
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
                if (!user && onOpenSignUp) onOpenSignUp();
                else onOpenDeposit();
              }}
              className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-[#161616] hover:bg-[#202020] border border-white/10 hover:border-[#E8FF00]/40 active:scale-95 transition-all cursor-pointer shadow-sm"
              title="Open Wallet Deposit"
            >
              <Wallet className="w-3.5 h-3.5 text-[#E8FF00] shrink-0" />
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] font-arcade font-bold text-white/50">ETB</span>
                <span className="font-arcade font-black text-xs text-white max-w-[70px] sm:max-w-[100px] truncate">
                  {user ? (user.walletBalance ?? (user as any).balance ?? 0).toLocaleString() : '0'}
                </span>
              </div>
              <div className="w-4 h-4 rounded-full flex items-center justify-center bg-[#E8FF00] text-black">
                <Plus className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => {
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
                loadJackpotData(false);
              }}
              className="p-1.5 rounded-xl bg-[#161616] hover:bg-[#222] border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
              title="Refresh Catalog"
              aria-label="Refresh Catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E8FF00]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. MAIN SCROLLABLE CONTENT STAGE                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4 pb-44">
        {/* Banner: Postponed Alert if applicable */}
        {isPostponed && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/80 via-orange-950/50 to-[#121212] border border-amber-500/40 shadow-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <div className="font-arcade font-black text-amber-300 uppercase tracking-wide">
                JACKPOT POSTPONED — REGISTRATION STILL OPEN
              </div>
              <p className="text-white/80 leading-relaxed text-[11px]">
                Under 100 cards were registered by 12:00 PM. All registered cards rollover safely. Draw scheduled for next 12:00 PM!
              </p>
            </div>
          </div>
        )}

        {/* Hero Jackpot Strip: 150,000 BIRR + 999 BIRR/CARD + Participation */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1402] via-[#121212] to-[#090909] border border-amber-500/40 p-4 sm:p-5 shadow-[0_0_35px_rgba(245,158,11,0.15)]">
          {/* Subtle Background Glow Orb */}
          <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Left: Champion Payout */}
            <div className="space-y-1">
              <div className="text-[10px] font-arcade font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 fill-current" />
                <span>GUARANTEED CHAMPION PAYOUT</span>
              </div>
              <div className="font-arcade text-3xl sm:text-4xl font-black text-amber-300 tracking-tight drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                {jackpotDisplayAmount.toLocaleString()} BIRR
              </div>
              <p className="text-[11px] text-white/60">
                100% Pari-Mutuel winner payout on 75-Ball Full House / Line BINGO
              </p>
            </div>

            {/* Right: Card Price & Participation Indicator */}
            <div className="sm:text-right space-y-1.5 shrink-0">
              <div className="inline-block px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-arcade font-black text-sm">
                999 BIRR / CARD
              </div>
              <div className="text-xs text-white/70 font-arcade">
                CARDS: <strong className="text-white font-black">{cardsSold} / {MAX_CARDS}</strong>
                <span className="text-white/40 ml-1">({MIN_CARDS} min to start)</span>
              </div>
              {/* Progress Bar */}
              <div className="w-full sm:w-44 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* 3. CARD PREVIEW SECTION (Authentic 5x5 Grid Before Buying)             */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <section className="rounded-3xl bg-[#0e0e0e] border border-white/10 p-3.5 sm:p-4 space-y-3 shadow-xl">
          {/* Preview Header & Active Card Selection Strip */}
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/40 flex items-center justify-center text-[#E8FF00] font-arcade font-black text-xs">
                #{activeCardItem.cardNumber}
              </div>
              <div>
                <div className="font-arcade font-black text-xs sm:text-sm text-white tracking-wide flex items-center gap-1.5">
                  <span>CARD #{activeCardItem.cardNumber} PREVIEW</span>
                  {activeCardItem.isOwnedByMe && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-400/40">
                      OWNED BY YOU
                    </span>
                  )}
                  {selectedNumbers.includes(activeCardItem.cardNumber) && !activeCardItem.isOwnedByMe && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-400/40">
                      SELECTED
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-white/50 font-arcade">
                  Inspect numbers before confirming purchase • Official 75-Ball Matrix
                </div>
              </div>
            </div>

            {/* Quick multi-selection preview switcher */}
            {selectedNumbers.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full">
                <span className="text-[9px] font-arcade text-white/50 uppercase shrink-0">Selected:</span>
                {selectedNumbers.map(num => (
                  <button
                    key={num}
                    onClick={() => {
                      soundService.playClick();
                      setPreviewCardNumber(num);
                    }}
                    className={`px-2 py-0.5 rounded-lg font-arcade text-[10px] font-black transition-all cursor-pointer shrink-0 ${
                      previewCardNumber === num
                        ? 'bg-[#E8FF00] text-black shadow-sm'
                        : 'bg-[#181818] text-white/70 hover:text-white border border-white/10'
                    }`}
                  >
                    #{num}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 5x5 Matrix Layout (High Contrast, Responsive, Mobile-Friendly) */}
          <div className="max-w-[340px] sm:max-w-[380px] mx-auto w-full bg-[#080808] border border-white/10 rounded-2xl p-2 sm:p-2.5 shadow-2xl">
            {/* B-I-N-G-O Columns Header */}
            <div className="grid grid-cols-5 gap-1.5 mb-1.5">
              {COL_NAMES.map(col => {
                const style = COL_STYLES[col];
                return (
                  <div
                    key={col}
                    className="py-1 rounded-xl text-center flex items-center justify-center font-arcade font-black text-xs sm:text-sm tracking-wider shadow-sm"
                    style={{
                      backgroundColor: style.bg,
                      borderColor: style.border,
                      borderWidth: '1px',
                      color: style.color
                    }}
                  >
                    {col}
                  </div>
                );
              })}
            </div>

            {/* 5x5 Number Grid */}
            <div className="grid grid-rows-5 gap-1.5">
              {matrix.map((row, rIdx) => (
                <div key={rIdx} className="grid grid-cols-5 gap-1.5">
                  {row.map((num, cIdx) => {
                    const isFree = num === 0;
                    return (
                      <div
                        key={`${rIdx}-${cIdx}`}
                        className={`relative flex flex-col items-center justify-center rounded-xl transition-all select-none border ${
                          isFree
                            ? 'bg-[#E8FF00]/15 border-[#E8FF00]/60 text-[#E8FF00] shadow-[0_0_10px_rgba(232,255,0,0.2)]'
                            : 'bg-[#141414] border-white/10 text-white hover:border-white/25'
                        }`}
                        style={{ aspectRatio: '1' }}
                      >
                        {isFree ? (
                          <div className="flex flex-col items-center justify-center">
                            <Star className="w-3.5 h-3.5 fill-current text-[#E8FF00]" />
                            <span className="text-[7px] sm:text-[8px] font-arcade font-black text-[#E8FF00] tracking-tighter">
                              FREE
                            </span>
                          </div>
                        ) : (
                          <span className="font-arcade font-black text-xs sm:text-sm text-white">
                            {num}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* 4. CARD CATALOG SECTION (1..200 Grid with High-Contrast States)       */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <section className="rounded-3xl bg-[#0e0e0e] border border-white/10 p-3.5 sm:p-4 space-y-3 shadow-xl">
          {/* Filter Bar & Quick Select Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <div className="font-arcade font-black text-xs sm:text-sm text-white tracking-wide uppercase flex items-center gap-2">
                <span>CARD CATALOG (1 — 200)</span>
                <span className="px-2 py-0.5 rounded-md bg-[#1c1c1c] text-[#E8FF00] font-bold text-[10px] border border-white/10">
                  {selectedNumbers.length === 1 ? '1 CARD SELECTED' : `${selectedNumbers.length} CARDS SELECTED`}
                </span>
              </div>
              <p className="text-[10px] text-white/50 font-arcade">
                Tap a card to preview its numbers. Select one or multiple cards to enter.
              </p>
            </div>

            {/* Quick Select Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => handleSelectFirstAvailable(1)}
                className="px-2.5 py-1 rounded-xl bg-[#161616] hover:bg-[#222] border border-white/10 font-arcade text-[10px] font-bold text-white/80 hover:text-white transition-all cursor-pointer"
              >
                + Auto 1
              </button>
              <button
                onClick={() => handleSelectFirstAvailable(5)}
                className="px-2.5 py-1 rounded-xl bg-[#161616] hover:bg-[#222] border border-white/10 font-arcade text-[10px] font-bold text-white/80 hover:text-white transition-all cursor-pointer"
              >
                + Auto 5
              </button>
              {selectedNumbers.length > 0 && (
                <button
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 font-arcade text-[10px] font-bold text-rose-300 transition-all cursor-pointer"
                >
                  Clear ({selectedNumbers.length})
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs: ALL, AVAILABLE, SELECTED, MY CARDS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/10">
            <button
              onClick={() => { soundService.playClick(); setCatalogFilter('all'); }}
              className={`px-3 py-1 rounded-xl font-arcade text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                catalogFilter === 'all'
                  ? 'bg-[#E8FF00] text-black shadow-sm'
                  : 'bg-[#161616] text-white/70 hover:text-white border border-white/10'
              }`}
            >
              ALL ({cards.length})
            </button>
            <button
              onClick={() => { soundService.playClick(); setCatalogFilter('available'); }}
              className={`px-3 py-1 rounded-xl font-arcade text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                catalogFilter === 'available'
                  ? 'bg-[#E8FF00] text-black shadow-sm'
                  : 'bg-[#161616] text-white/70 hover:text-white border border-white/10'
              }`}
            >
              AVAILABLE ({cards.filter(c => !c.isTaken).length})
            </button>
            <button
              onClick={() => { soundService.playClick(); setCatalogFilter('selected'); }}
              className={`px-3 py-1 rounded-xl font-arcade text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                catalogFilter === 'selected'
                  ? 'bg-[#E8FF00] text-black shadow-sm'
                  : 'bg-[#161616] text-white/70 hover:text-white border border-white/10'
              }`}
            >
              SELECTED ({selectedNumbers.length})
            </button>
            <button
              onClick={() => { soundService.playClick(); setCatalogFilter('my_cards'); }}
              className={`px-3 py-1 rounded-xl font-arcade text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                catalogFilter === 'my_cards'
                  ? 'bg-[#E8FF00] text-black shadow-sm'
                  : 'bg-[#161616] text-white/70 hover:text-white border border-white/10'
              }`}
            >
              MY CARDS ({cards.filter(c => c.isOwnedByMe).length})
            </button>
          </div>

          {/* Cards Grid: 1..200 Buttons */}
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {displayedCards.map(card => {
              const isSelected = selectedNumbers.includes(card.cardNumber);
              const isPreviewed = previewCardNumber === card.cardNumber;
              const isTaken = card.isTaken && !card.isOwnedByMe;
              const isOwned = card.isOwnedByMe;

              let btnStyle = 'bg-[#141414] border-white/10 text-white/80 hover:border-white/30 hover:bg-[#1a1a1a]';
              if (isOwned) {
                btnStyle = 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)]';
              } else if (isSelected) {
                btnStyle = 'bg-amber-500/30 border-amber-400 text-amber-200 font-black shadow-[0_0_12px_rgba(245,158,11,0.5)] ring-1 ring-amber-400';
              } else if (isTaken) {
                btnStyle = 'bg-[#101010] border-white/5 text-white/20 cursor-not-allowed opacity-40';
              }

              if (isPreviewed && !isSelected && !isOwned) {
                btnStyle += ' ring-2 ring-[#E8FF00]/70';
              }

              return (
                <button
                  key={card.cardNumber}
                  onClick={() => handleToggleCardSelection(card.cardNumber)}
                  disabled={isTaken}
                  className={`relative py-2 px-1 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 text-center ${btnStyle}`}
                  title={
                    isOwned
                      ? `Card #${card.cardNumber} (Owned by you)`
                      : isTaken
                      ? `Card #${card.cardNumber} (Taken)`
                      : isSelected
                      ? `Card #${card.cardNumber} (Selected - Click to unselect)`
                      : `Card #${card.cardNumber} (Click to select & preview)`
                  }
                >
                  <div className="flex items-center gap-0.5">
                    {isSelected && <Check className="w-3 h-3 text-amber-400 stroke-[3]" />}
                    {isOwned && <Star className="w-2.5 h-2.5 fill-current text-emerald-400" />}
                    <span className="font-arcade font-black text-[11px] sm:text-xs">
                      #{card.cardNumber}
                    </span>
                  </div>
                  <span className="text-[8px] font-arcade uppercase tracking-tighter opacity-70 mt-0.5">
                    {isOwned ? 'OWNED' : isTaken ? 'TAKEN' : isSelected ? 'CHOSEN' : 'OPEN'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 5. STICKY BOTTOM ACTION BAR (Total, Balance, Confirmation Button)       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/10 p-3 sm:p-4 shadow-[0_-10px_35px_rgba(0,0,0,0.8)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Inline Alert / Notification Messages */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="font-bold text-rose-400 hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                onClick={() => setSuccessMsg(null)}
                className="font-bold text-emerald-400 hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Investment & Balance Info Row */}
          <div className="flex items-center justify-between text-xs px-1">
            <div className="space-y-0.5">
              <span className="text-[10px] font-arcade text-white/50 uppercase">TOTAL INVESTMENT</span>
              <div className="font-arcade font-black text-sm sm:text-base text-amber-300">
                {totalInvestment.toLocaleString()} BIRR
                <span className="text-[10px] text-white/50 font-normal ml-1">
                  ({selectedNumbers.length} × 999)
                </span>
              </div>
            </div>

            <div className="text-right space-y-0.5">
              <span className="text-[10px] font-arcade text-white/50 uppercase">WALLET BALANCE</span>
              <div className={`font-arcade font-black text-sm sm:text-base ${
                hasEnoughBalance ? 'text-[#E8FF00]' : 'text-rose-400'
              }`}>
                {user ? (user.walletBalance ?? (user as any).balance ?? 0).toLocaleString() : '0'} BIRR
              </div>
            </div>
          </div>

          {/* Confirm & Enter Button with Full Responsive States */}
          <div className="flex items-center gap-2">
            {!hasEnoughBalance && selectedNumbers.length > 0 && user && (
              <button
                onClick={() => {
                  soundService.playClick();
                  telegramSdk.triggerHaptic('light');
                  onOpenDeposit();
                }}
                className="px-3.5 py-3 rounded-2xl bg-[#181818] hover:bg-[#222] border border-amber-400/40 text-amber-300 font-arcade font-black text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>DEPOSIT</span>
              </button>
            )}

            <button
              onClick={handleConfirmPurchase}
              disabled={purchasing || selectedNumbers.length === 0}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-arcade font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98] ${
                purchasing
                  ? 'bg-[#222] text-white/40 border border-white/10 cursor-not-allowed'
                  : selectedNumbers.length === 0
                  ? 'bg-[#181818] text-white/40 border border-white/10 cursor-not-allowed'
                  : purchaseSuccess
                  ? 'bg-emerald-500 text-black border border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.7)]'
                  : !hasEnoughBalance
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black border border-amber-400'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-[#E8FF00] hover:brightness-110 text-black border border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.5)]'
              }`}
            >
              {purchasing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ENTERING JACKPOT...</span>
                </>
              ) : purchaseSuccess ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>✓ ENTERED JACKPOT</span>
                </>
              ) : selectedNumbers.length === 0 ? (
                <span>SELECT A CARD TO ENTER</span>
              ) : !user ? (
                <span>LOG IN TO ENTER JACKPOT</span>
              ) : !hasEnoughBalance ? (
                <span>INSUFFICIENT BALANCE — TOP UP</span>
              ) : (
                <>
                  <span>CONFIRM & ENTER ({selectedNumbers.length})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
