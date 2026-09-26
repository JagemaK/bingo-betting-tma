import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Gift,
  Clock,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  Search,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Zap,
  Flame,
  Grid,
  ArrowRight
} from 'lucide-react';
import { GameRoomState, CurrencyType, UserAccount, BingoGrid } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { apiUrl } from '../config/api.js';
import { TopHeader } from './TopHeader.js';
import { BottomNavDock } from './BottomNavDock.js';

interface CardSelectionBoardProps {
  roomState: GameRoomState;
  user: UserAccount | null;
  currency: CurrencyType;
  myTicketCardNumbers: number[];
  errorMessage?: string | null;
  onDismissError?: () => void;
  onSelectCard: (cardNumber: number) => void;
  onDeselectCard: (cardNumber: number) => void;
  onLockMultipleCards: (cardNumbers: number[]) => void;
  onRandomSelect: (count: number) => void;
  onBackToLobby: () => void;
  onOpenWallet: () => void;
  onOpenLeaderboard: () => void;
  onOpenReferral: () => void;
  onOpenContact: () => void;
  onOpenRules: () => void;
  onOpenSignUp?: () => void;
  onOpenLogin?: () => void;
  onOpenProfile?: () => void;
  onOpenAdmin?: () => void;
  onSelectCurrency: (c: CurrencyType) => void;
  onRefresh: () => void;
  hasRewardNotification?: boolean;
}

// Deterministic fallback card generator for instant UI preview
function generateDeterministicCard(seedNum: number): BingoGrid {
  const getColNumbers = (min: number, max: number, count: number, offset: number) => {
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const result: number[] = [];
    let seed = seedNum * 31 + offset;
    while (result.length < count) {
      seed = (seed * 9301 + 49297) % 233280;
      const idx = Math.floor((seed / 233280) * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result.sort((a, b) => a - b);
  };

  const b = getColNumbers(1, 15, 5, 1);
  const i = getColNumbers(16, 30, 5, 2);
  const n = getColNumbers(31, 45, 4, 3);
  n.splice(2, 0, 0); // Center free
  const g = getColNumbers(46, 60, 5, 4);
  const o = getColNumbers(61, 75, 5, 5);

  return { B: b, I: i, N: n, G: g, O: o };
}

export const CardSelectionBoard: React.FC<CardSelectionBoardProps> = ({
  roomState,
  user,
  currency,
  myTicketCardNumbers,
  errorMessage,
  onDismissError,
  onSelectCard,
  onDeselectCard,
  onLockMultipleCards,
  onRandomSelect,
  onBackToLobby,
  onOpenWallet,
  onOpenLeaderboard,
  onOpenReferral,
  onOpenRules,
  onOpenSignUp,
  onOpenLogin,
  onOpenProfile,
  onOpenAdmin,
  hasRewardNotification = false,
}) => {
  // View mode: 'matrix' (Default 200-card multi-select grid) vs 'inspector' (Single 5x5 card inspect)
  const [viewMode, setViewMode] = useState<'matrix' | 'inspector'>('matrix');
  const [activeCardNumber, setActiveCardNumber] = useState<number>(() => {
    return myTicketCardNumbers.length > 0 ? myTicketCardNumbers[0] : 1;
  });

  const [filterTab, setFilterTab] = useState<'all' | 'available' | 'mine'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cardCatalogCache, setCardCatalogCache] = useState<Record<number, BingoGrid>>({});
  const [localSeconds, setLocalSeconds] = useState<number>(roomState.lobbyTimeRemaining);

  // Set of locally selected card numbers for batch locking
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set(myTicketCardNumbers));
  const [isLocking, setIsLocking] = useState<boolean>(false);

  const totalCards = roomState.totalCatalogCards || 200;
  const lockedServerCards = new Set(myTicketCardNumbers);

  // Sync timer
  useEffect(() => {
    setLocalSeconds(roomState.lobbyTimeRemaining);
  }, [roomState.lobbyTimeRemaining]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync server locked tickets into selection
  useEffect(() => {
    setSelectedCards((prev) => {
      const merged = new Set(prev);
      myTicketCardNumbers.forEach((n) => merged.add(n));
      return merged;
    });
    if (myTicketCardNumbers.length > 0 && !myTicketCardNumbers.includes(activeCardNumber)) {
      setActiveCardNumber(myTicketCardNumbers[myTicketCardNumbers.length - 1]);
    }
  }, [myTicketCardNumbers]);

  // Pre-fetch catalog
  useEffect(() => {
    let isMounted = true;
    fetch(apiUrl(`/api/room/${roomState.roomId}/catalog`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.catalog) {
          setCardCatalogCache(data.catalog);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [roomState.roomId, roomState.gameId]);

  const formatCurrency = (val: number) => `${((val ?? 0)).toLocaleString()} Birr`;

  const formatUserBalance = () => {
    if (!user) return '0 Birr';
    return `${((user.walletBalance ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Birr`;
  };

  const formattedTimer = `0:${localSeconds.toString().padStart(2, '0')}`;
  const stakeFormatted = formatCurrency(roomState.betPerCard);
  const isCountdownActive = Boolean(roomState.isCountdownActive);

  // Get active 5x5 card grid from cache or fallback
  const getCardGrid = (cardNum: number): BingoGrid => {
    if (cardCatalogCache[cardNum]) return cardCatalogCache[cardNum];
    return generateDeterministicCard(cardNum);
  };

  const activeCardGrid = getCardGrid(activeCardNumber);
  const isCurrentCardLocked = lockedServerCards.has(activeCardNumber);
  const currentCardTakenInfo = roomState.takenCardNumbers ? roomState.takenCardNumbers[activeCardNumber] : null;
  const isCurrentCardTakenByOther = Boolean(currentCardTakenInfo && !isCurrentCardLocked);

  const allCardNumbers = Array.from({ length: totalCards }, (_, i) => i + 1);

  const getAvailableCardNumbers = useCallback(() => {
    return allCardNumbers.filter((n) => {
      const taken = roomState.takenCardNumbers ? roomState.takenCardNumbers[n] : null;
      return !taken || lockedServerCards.has(n);
    });
  }, [allCardNumbers, roomState.takenCardNumbers, lockedServerCards]);

  // Navigate cards in Inspector
  const handlePrevCard = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setActiveCardNumber((prev) => (prev > 1 ? prev - 1 : totalCards));
  };

  const handleNextCard = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setActiveCardNumber((prev) => (prev < totalCards ? prev + 1 : 1));
  };

  const handleShuffleRandomCard = () => {
    soundService.playLineChime();
    telegramSdk.triggerHaptic('medium');
    const available = getAvailableCardNumbers();
    if (available.length > 0) {
      const randomCard = available[Math.floor(Math.random() * available.length)];
      setActiveCardNumber(randomCard);
    }
  };

  // Direct 1-Tap Lock for Active Card
  const handleLockActiveCard = async () => {
    if (isCurrentCardTakenByOther || isCurrentCardLocked) {
      soundService.playInvalidClick();
      return;
    }

    setIsLocking(true);
    soundService.playLineChime();
    telegramSdk.triggerHaptic('heavy');

    onSelectCard(activeCardNumber);
    setSelectedCards((prev) => new Set([...Array.from(prev), activeCardNumber]));
    setTimeout(() => setIsLocking(false), 600);
  };

  // Deselect / Unlock Active Card
  const handleUnlockActiveCard = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    onDeselectCard(activeCardNumber);
    setSelectedCards((prev) => {
      const next = new Set(prev);
      next.delete(activeCardNumber);
      return next;
    });
  };

  // Toggle selection in matrix
  const handleToggleCardSelection = (cardNum: number) => {
    setActiveCardNumber(cardNum);
    const isLocked = lockedServerCards.has(cardNum);
    const isChosen = selectedCards.has(cardNum);
    const takenInfo = roomState.takenCardNumbers ? roomState.takenCardNumbers[cardNum] : null;
    const isTakenByOther = Boolean(takenInfo && !isLocked);

    if (isTakenByOther) {
      soundService.playInvalidClick();
      return;
    }

    if (isLocked) {
      soundService.playClick();
      telegramSdk.triggerHaptic('light');
      onDeselectCard(cardNum);
      setSelectedCards((prev) => {
        const next = new Set(prev);
        next.delete(cardNum);
        return next;
      });
      return;
    }

    if (isChosen) {
      soundService.playClick();
      telegramSdk.triggerHaptic('light');
      setSelectedCards((prev) => {
        const next = new Set(prev);
        next.delete(cardNum);
        return next;
      });
    } else {
      soundService.playClick();
      telegramSdk.triggerHaptic('medium');
      setSelectedCards((prev) => new Set([...Array.from(prev), cardNum]));
    }
  };

  // Quick Random Pick helper
  const handleQuickPick = (count: number) => {
    const available = allCardNumbers.filter(
      (n) =>
        !selectedCards.has(n) &&
        (!roomState.takenCardNumbers || !roomState.takenCardNumbers[n] || lockedServerCards.has(n))
    );

    if (available.length === 0) return;

    soundService.playLineChime();
    telegramSdk.triggerHaptic('medium');

    const newlyPicked: number[] = [];
    for (let i = 0; i < count && available.length > 0; i++) {
      const randIdx = Math.floor(Math.random() * available.length);
      const chosen = available.splice(randIdx, 1)[0];
      newlyPicked.push(chosen);
    }

    if (newlyPicked.length > 0) {
      setActiveCardNumber(newlyPicked[0]);
    }
    setSelectedCards((prev) => new Set([...Array.from(prev), ...newlyPicked]));
  };

  // Lock In and Buy all selected uncommitted cards
  const handleLockInBatchCards = async () => {
    const uncommitted = Array.from(selectedCards).filter((n) => !lockedServerCards.has(n));
    if (uncommitted.length === 0) {
      if (selectedCards.size === 0) {
        handleQuickPick(1);
      }
      return;
    }

    setIsLocking(true);
    soundService.playLineChime();
    telegramSdk.triggerHaptic('heavy');

    onLockMultipleCards(uncommitted);
    setTimeout(() => setIsLocking(false), 800);
  };

  const uncommittedCards = Array.from(selectedCards).filter((n) => !lockedServerCards.has(n));
  const selectedCount = selectedCards.size;
  const uncommittedCount = uncommittedCards.length;
  const cardPrice = roomState.betPerCard;
  const totalCost = selectedCount * cardPrice;
  const uncommittedCost = uncommittedCount * cardPrice;

  // Projected Room Cards & Win Pool
  const projectedTotalCards = Math.max(roomState.totalCardsSold, selectedCount);
  const projectedPool = projectedTotalCards * cardPrice;
  const is5PBonus = projectedTotalCards <= 5;
  const potentialWinReward = projectedTotalCards > 0
    ? (is5PBonus ? projectedPool : projectedPool * 0.8)
    : cardPrice * 0.8;
  const winPercent = is5PBonus ? 100 : 80;

  const filteredCardNumbers = allCardNumbers.filter((cardNum) => {
    const isChosen = selectedCards.has(cardNum);
    const isTakenByOther = Boolean(
      roomState.takenCardNumbers && roomState.takenCardNumbers[cardNum] && !lockedServerCards.has(cardNum)
    );

    if (searchQuery) {
      if (!cardNum.toString().includes(searchQuery)) return false;
    }

    if (filterTab === 'mine') return isChosen;
    if (filterTab === 'available') return !isTakenByOther;
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-[#080808] text-white flex flex-col relative overflow-x-hidden font-sans pb-56 select-none">
      {/* Top Header */}
      <TopHeader
        mode="card_selection"
        user={user}
        roomName={roomState.roomName}
        stakeFormatted={stakeFormatted}
        countdownTimer={formattedTimer}
        isCountdownActive={isCountdownActive}
        totalCardsSold={roomState.totalCardsSold}
        minCardsToStart={roomState.minCardsToStart || 5}
        onBack={onBackToLobby}
        onOpenWallet={onOpenWallet}
        onOpenRules={onOpenRules}
        onOpenSignUp={onOpenSignUp}
        onOpenLogin={onOpenLogin}
        onOpenProfile={onOpenProfile}
        onOpenAdmin={onOpenAdmin}
      />

      {/* Main Container */}
      <main className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-48 flex-1 relative z-10">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button onClick={onDismissError} className="text-rose-400 hover:text-white font-bold px-1.5 py-0.5 cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* POT & COUNTDOWN BANNER (ARCADE SPEC)               */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#111111] border border-white/10 shadow-sm text-center">
          <div className="p-2 rounded-xl bg-[#161616] border border-white/5">
            <span className="text-[9px] font-arcade font-bold uppercase tracking-wider text-white/50 block">TOTAL POT</span>
            <span className="text-xs font-arcade font-black text-white truncate block mt-0.5">
              {formatCurrency(roomState.totalPot)}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#E8FF00]/10 border border-[#E8FF00]/30">
            <span className="text-[9px] font-arcade font-bold uppercase tracking-wider text-[#E8FF00] block">
              1ST PRIZE ({roomState.winnerPayoutPercent || (roomState.totalCardsSold <= 5 ? 100 : 80)}%)
            </span>
            <span className="text-xs font-arcade font-black text-[#E8FF00] truncate block mt-0.5">
              {formatCurrency(roomState.winnerPayoutAmount || roomState.playerPayoutPool || roomState.totalPot * 0.8)}
            </span>
          </div>

          <div className={`p-2 rounded-xl border ${
            isCountdownActive
              ? 'bg-[#E8FF00]/20 border-[#E8FF00]/50 text-[#E8FF00] animate-pulse'
              : 'bg-[#161616] border-white/5 text-white/60'
          }`}>
            <span className="text-[9px] font-arcade font-bold uppercase tracking-wider block">
              {isCountdownActive ? 'STARTING IN' : 'MIN 5 CARDS'}
            </span>
            <span className="text-xs font-arcade font-black truncate block mt-0.5">
              {isCountdownActive ? formattedTimer : `${roomState.totalCardsSold} / 5 LOCKED`}
            </span>
          </div>
        </div>

        {/* Countdown Flash Alert */}
        {isCountdownActive && (
          <div className="p-3 rounded-2xl text-xs flex items-center justify-between bg-[#E8FF00]/15 border border-[#E8FF00]/40 text-[#E8FF00] shadow-[0_0_15px_rgba(232,255,0,0.15)] animate-pulse">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#E8FF00] flex-shrink-0 animate-spin" />
              <span className="font-arcade font-black">STARTING SOON! LOCK IN TICKETS NOW</span>
            </div>
            <span className="font-arcade font-black text-xs px-2.5 py-1 rounded-lg bg-black text-[#E8FF00] border border-[#E8FF00]/50">
              {formattedTimer}
            </span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* QUICK QUANTITY SELECTOR (1, 2, 3, 5, 10, RANDOM)   */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-arcade font-black text-xs uppercase tracking-wider text-white">
              QUICK QUANTITY SELECT
            </span>
            <button
              onClick={() => handleQuickPick(1)}
              className="flex items-center gap-1 font-arcade font-bold text-xs text-[#E8FF00] hover:underline cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>LUCKY PICK 🎲</span>
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 5, 10].map((qty) => (
              <button
                key={qty}
                onClick={() => handleQuickPick(qty)}
                className="btn-dark-arcade py-2 text-xs font-arcade font-black rounded-xl hover:border-[#E8FF00]/50 transition-all flex flex-col items-center justify-center cursor-pointer active:scale-95"
              >
                <span>+{qty}</span>
                <span className="text-[8px] text-white/40 font-normal uppercase">
                  {qty * roomState.betPerCard}B
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* MATRIX VS INSPECTOR MODE TOGGLE                    */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between gap-2 px-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <button
              onClick={() => {
                setViewMode('matrix');
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-arcade text-[11px] sm:text-xs font-bold transition-all uppercase cursor-pointer shrink-0 whitespace-nowrap ${
                viewMode === 'matrix'
                  ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                  : 'bg-[#141414] text-white/60 border border-white/10'
              }`}
            >
              200-Card Matrix
            </button>

            <button
              onClick={() => {
                setViewMode('inspector');
                soundService.playClick();
                telegramSdk.triggerHaptic('light');
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-arcade text-[11px] sm:text-xs font-bold transition-all uppercase cursor-pointer shrink-0 whitespace-nowrap ${
                viewMode === 'inspector'
                  ? 'bg-[#E8FF00] text-black shadow-[0_0_10px_rgba(232,255,0,0.3)]'
                  : 'bg-[#141414] text-white/60 border border-white/10'
              }`}
            >
              5x5 Inspector
            </button>
          </div>

          <span className="font-arcade text-[11px] sm:text-xs text-white/50 shrink-0 whitespace-nowrap">
            SELECTED: <strong className="text-[#E8FF00]">{selectedCards.size}</strong>
          </span>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* MODE 1: 200-CARD MULTI-SELECT GRID (DEFAULT)       */}
        {/* ══════════════════════════════════════════════════ */}
        {viewMode === 'matrix' && (
          <div className="p-3 sm:p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm min-w-0">
            {/* Filter Tabs & Search */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#161616] border border-white/5 text-xs shrink-0 overflow-x-auto no-scrollbar">
                {(['all', 'available', 'mine'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg font-arcade font-bold uppercase transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                      filterTab === tab
                        ? 'bg-[#E8FF00] text-black'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? 'All' : tab === 'available' ? 'Open' : `Mine (${selectedCards.size})`}
                  </button>
                ))}
              </div>

              <div className="relative shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 shrink-0" />
                <input
                  type="text"
                  placeholder="# Card"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-20 sm:w-24 pl-7 pr-2 py-1 rounded-xl text-xs bg-[#161616] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#E8FF00] font-arcade shrink-0"
                />
              </div>
            </div>

            {/* 10-column High Contrast Matrix */}
            <div className="grid grid-cols-10 gap-1.5 select-none">
              {filteredCardNumbers.map((cardNum) => {
                const isLocked = lockedServerCards.has(cardNum);
                const isChosen = selectedCards.has(cardNum);
                const takenInfo = roomState.takenCardNumbers ? roomState.takenCardNumbers[cardNum] : null;
                const isTakenByOther = Boolean(takenInfo && !isLocked);

                return (
                  <button
                    key={cardNum}
                    onClick={() => handleToggleCardSelection(cardNum)}
                    className={`aspect-square rounded-xl font-arcade font-black text-xs transition-all flex items-center justify-center relative cursor-pointer active:scale-95 ${
                      isLocked
                        ? 'bg-emerald-500 text-black border-2 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] scale-105 z-10'
                        : isChosen
                        ? 'bg-[#E8FF00] text-black border-2 border-[#E8FF00] shadow-[0_0_12px_rgba(232,255,0,0.6)] scale-105 z-10'
                        : isTakenByOther
                        ? 'bg-[#181818] text-white/20 border border-white/5 opacity-40 cursor-not-allowed'
                        : 'bg-[#181818] text-white/80 border border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span>{cardNum}</span>
                    {isLocked && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black text-emerald-400 font-black text-[7px] flex items-center justify-center border border-emerald-400">
                        ✓
                      </span>
                    )}
                    {isChosen && !isLocked && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black text-[#E8FF00] font-black text-[7px] flex items-center justify-center border border-[#E8FF00]">
                        +
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* MODE 2: 5x5 CARD INSPECTOR VIEW                    */}
        {/* ══════════════════════════════════════════════════ */}
        {viewMode === 'inspector' && (
          <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
            {/* Card Navigator Bar */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#161616] border border-white/10">
              <button
                onClick={handlePrevCard}
                className="p-1.5 rounded-lg bg-[#202020] text-white hover:text-[#E8FF00] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="font-arcade text-xs text-white/50">CARD</span>
                <span className="font-arcade font-black text-sm px-3 py-0.5 rounded-lg bg-[#E8FF00] text-black">
                  #{activeCardNumber}
                </span>
                <span className="font-arcade text-xs text-white/40">/ {totalCards}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleShuffleRandomCard}
                  className="px-2.5 py-1 rounded-lg bg-[#202020] text-[#E8FF00] font-arcade font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>SHUFFLE</span>
                </button>
                <button
                  onClick={handleNextCard}
                  className="p-1.5 rounded-lg bg-[#202020] text-white hover:text-[#E8FF00] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 5x5 Face Grid */}
            <div className="rounded-2xl p-3 bg-[#0a0a0a] border border-white/10">
              <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                {(['B','I','N','G','O'] as const).map((letter) => (
                  <div key={letter} className="h-7 rounded-xl bg-[#1c1c1c] border border-white/10 font-arcade font-black text-xs text-[#E8FF00] flex items-center justify-center">
                    {letter}
                  </div>
                ))}
              </div>

              <div className="grid grid-rows-5 gap-1.5">
                {Array.from({ length: 5 }, (_, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-5 gap-1.5">
                    {(['B', 'I', 'N', 'G', 'O'] as const).map((col) => {
                      const num = activeCardGrid[col][rowIdx];
                      const isCenter = col === 'N' && rowIdx === 2;

                      return (
                        <div
                          key={`${col}-${rowIdx}`}
                          className={`aspect-square rounded-xl font-arcade font-black text-xs flex items-center justify-center ${
                            isCenter
                              ? 'bg-[#E8FF00] text-black shadow-[0_0_8px_rgba(232,255,0,0.5)]'
                              : isCurrentCardLocked
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : 'bg-[#181818] text-white border border-white/10'
                          }`}
                        >
                          {isCenter ? '★' : num}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Direct Lock Button */}
              <div className="mt-3 pt-3 border-t border-white/10">
                {isCurrentCardLocked ? (
                  <div className="flex items-center justify-between">
                    <span className="font-arcade text-xs text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      CARD #{activeCardNumber} IS LOCKED
                    </span>
                    <button
                      onClick={handleUnlockActiveCard}
                      className="font-arcade text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      UNLOCK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLockActiveCard}
                    disabled={isLocking || isCurrentCardTakenByOther}
                    className="btn-neon w-full py-2.5 rounded-xl text-xs font-arcade font-black uppercase"
                  >
                    {isLocking ? 'LOCKING IN...' : `LOCK IN CARD #${activeCardNumber} (${stakeFormatted})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════ */}
      {/* STICKY BOTTOM BUY BAR (TOTAL BIRR & GIANT CTA)     */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="fixed bottom-[84px] sm:bottom-[92px] left-0 right-0 z-30 px-2 sm:px-4 max-w-2xl mx-auto">
        <div className="p-2.5 sm:p-3.5 rounded-2xl flex items-center justify-between gap-2 sm:gap-3 bg-[#111111]/95 border-2 border-[#E8FF00]/40 backdrop-blur-xl shadow-[0_0_25px_rgba(0,0,0,0.8)] min-w-0">
          <div className="min-w-0 flex-1 mr-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-arcade text-[9px] sm:text-[10px] uppercase font-bold text-white/50 truncate whitespace-nowrap min-w-0">
                TOTAL STAKE ({selectedCount} CARDS)
              </span>
              {uncommittedCount > 0 && (
                <span className="text-[8px] sm:text-[9px] font-arcade font-bold px-1.5 py-0.2 rounded bg-[#E8FF00]/20 text-[#E8FF00] border border-[#E8FF00]/40 shrink-0 whitespace-nowrap">
                  {uncommittedCount} NEW
                </span>
              )}
            </div>
            <div className="font-arcade font-black text-xl sm:text-2xl text-[#E8FF00] leading-tight drop-shadow-[0_0_10px_rgba(232,255,0,0.3)] truncate whitespace-nowrap">
              {formatCurrency(totalCost)}
            </div>
            <div className="text-[9px] sm:text-[10px] font-arcade text-white/40 truncate whitespace-nowrap">
              Wallet: <span className="text-white font-bold">{formatUserBalance()}</span>
            </div>
          </div>

          <button
            onClick={handleLockInBatchCards}
            disabled={isLocking}
            className={`btn-neon text-xs sm:text-sm font-arcade font-black uppercase py-2.5 sm:py-3.5 px-3 sm:px-6 rounded-2xl flex items-center gap-1.5 sm:gap-2 shadow-[0_0_20px_rgba(232,255,0,0.4)] cursor-pointer active:scale-95 shrink-0 whitespace-nowrap ${
              uncommittedCount > 0 ? 'animate-pulse' : ''
            }`}
          >
            {isLocking ? (
              <span>LOCKING...</span>
            ) : uncommittedCount > 0 ? (
              <>
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3] shrink-0" />
                <span>BUY {uncommittedCount} TICKETS</span>
              </>
            ) : selectedCount > 0 ? (
              <>
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3] shrink-0" />
                <span>READY ({roomState.totalCardsSold}/5)</span>
              </>
            ) : (
              <>
                <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3] shrink-0" />
                <span>LUCKY PICK 1</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Nav Dock */}
      <BottomNavDock
        activeTab="rooms"
        onNavigateToRooms={onBackToLobby}
        onOpenWallet={onOpenWallet}
        onOpenReferral={onOpenReferral}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenRules={onOpenRules}
        inGame={true}
        hasRewardNotification={hasRewardNotification}
      />
    </div>
  );
};
