import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trophy,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
  Wallet
} from 'lucide-react';
import { UserAccount, DailyJackpotPublicState, DailyJackpotTicket } from '../types/bingo.js';
import { apiUrl } from '../config/api.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';

interface DailyJackpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  onOpenWallet: () => void;
  onOpenSignUp?: () => void;
  onUpdateUser?: (user: UserAccount) => void;
}

interface CardCatalogItem {
  cardNumber: number;
  isTaken: boolean;
  isOwnedByMe: boolean;
  price: number;
}

export const DailyJackpotModal: React.FC<DailyJackpotModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenWallet,
  onOpenSignUp,
  onUpdateUser
}) => {
  const [jackpotData, setJackpotData] = useState<DailyJackpotPublicState | null>(null);
  const [cards, setCards] = useState<CardCatalogItem[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'my_cards' | 'rules'>('catalog');
  const [timeRemainingStr, setTimeRemainingStr] = useState<string>('');

  const CARD_PRICE = 999;

  // Load current jackpot state and catalog
  const loadJackpotInfo = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('token') || localStorage.getItem('session_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [resState, resCards] = await Promise.all([
        fetch(apiUrl('/api/daily-jackpot/current'), { headers }),
        fetch(apiUrl('/api/daily-jackpot/cards'), { headers })
      ]);

      if (resState.ok) {
        const data = await resState.json();
        setJackpotData(data);
      }
      if (resCards.ok) {
        const data = await resCards.json();
        setCards(data.cards || []);
      }
    } catch (err: any) {
      if (!silent) setErrorMsg('Failed to load Daily Grand Jackpot details');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadJackpotInfo();
      setSelectedNumbers([]);
    }
  }, [isOpen]);

  // Countdown to 12:00 PM Ethiopia time
  useEffect(() => {
    if (!jackpotData) return;

    const interval = setInterval(() => {
      const cutoff = Date.parse(jackpotData.cutoffTime);
      const now = Date.now();
      const diff = cutoff - now;

      if (diff <= 0) {
        setTimeRemainingStr('00:00:00 (Check in progress)');
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemainingStr(
          `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jackpotData]);

  if (!isOpen) return null;

  const totalCost = selectedNumbers.length * CARD_PRICE;
  const userBalance = user?.walletBalance ?? 0;
  const hasEnoughBalance = userBalance >= totalCost;

  const handleToggleCard = (cardNum: number, isTaken: boolean) => {
    if (isTaken) return;
    soundService.playClick();
    telegramSdk.triggerHaptic('light');

    if (selectedNumbers.includes(cardNum)) {
      setSelectedNumbers(prev => prev.filter(n => n !== cardNum));
    } else {
      if (selectedNumbers.length + (jackpotData?.cardsSold || 0) >= 200) {
        setErrorMsg('Maximum 200 cards capacity reached for this round.');
        return;
      }
      setSelectedNumbers(prev => [...prev, cardNum]);
    }
  };

  const handlePurchase = async () => {
    if (selectedNumbers.length === 0) return;
    if (!user) {
      if (onOpenSignUp) onOpenSignUp();
      return;
    }

    if (!hasEnoughBalance) {
      onOpenWallet();
      return;
    }

    setPurchasing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('session_token');
      const res = await fetch(apiUrl('/api/daily-jackpot/purchase'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ cardNumbers: selectedNumbers })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to purchase cards');
      }

      soundService.playJackpotFanfare();
      telegramSdk.triggerHaptic('heavy');

      setSuccessMsg(`🎉 Successfully purchased ${selectedNumbers.length} card(s) for the Daily Grand Jackpot!`);
      setSelectedNumbers([]);

      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }

      // Refresh cards list and jackpot info
      loadJackpotInfo(true);
    } catch (err: any) {
      soundService.playError();
      setErrorMsg(err.message || 'Purchase failed');
    } finally {
      setPurchasing(false);
    }
  };

  const myTickets = jackpotData?.myTickets || [];
  const cardsSold = jackpotData?.cardsSold || 0;
  const minCards = jackpotData?.minCards || 100;
  const maxCards = jackpotData?.maxCards || 200;
  const progressPercent = Math.min(100, Math.round((cardsSold / maxCards) * 100));
  const isPostponed = jackpotData?.isPostponed || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-[#0d0d0d] border border-amber-500/30 rounded-3xl flex flex-col shadow-[0_0_50px_rgba(245,158,11,0.2)] overflow-hidden">
        
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-amber-950/40 via-[#141414] to-[#0d0d0d] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-arcade text-base sm:text-lg font-black uppercase text-white tracking-wider">
                  DAILY GRAND JACKPOT
                </span>
                <span className="text-[10px] font-arcade font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  999 BIRR / CARD
                </span>
              </div>
              <p className="text-xs text-white/50 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Daily Cutoff: <strong>12:00 PM (Addis Ababa)</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans custom-scrollbar">

          {/* Messages */}
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="font-bold text-rose-400 hover:text-white">✕</button>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="font-bold text-emerald-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Postponed Alert Banner */}
          {isPostponed && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/80 via-orange-950/60 to-black border border-amber-500/50 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-arcade text-xs font-black uppercase text-amber-300 tracking-wider">
                    DAILY GRAND JACKPOT POSTPONED
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed">
                    Not enough cards were sold to start today's jackpot. Minimum required: <strong>100 cards</strong>.
                  </p>
                  <p className="text-[11px] text-amber-200/70">
                    Registration remains open for the next Daily Grand Jackpot. Next check: <strong>Tomorrow at 12:00 PM</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Featured Hero Metric Box */}
          <div className="relative p-5 rounded-3xl bg-gradient-to-br from-[#1a1402] via-[#121212] to-[#0a0a0a] border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.15)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[10px] font-arcade font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>GUARANTEED CHAMPION PAYOUT</span>
              </div>
              <div className="font-arcade text-3xl sm:text-4xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                {(jackpotData?.jackpotAmount || 100000).toLocaleString()} BIRR
              </div>
              <p className="text-xs text-white/50">
                100% Pari-Mutuel winner payout on 75-Ball Full House / Line BINGO
              </p>
            </div>

            {/* Countdown Badge */}
            <div className="p-3 rounded-2xl bg-black/50 border border-white/10 flex flex-col items-start sm:items-end justify-center min-w-[140px]">
              <span className="text-[10px] font-arcade font-bold text-white/50 uppercase">
                {isPostponed ? 'NEXT CHECK AT 12:00 PM' : 'TIME REMAINING'}
              </span>
              <span className="font-mono text-base font-black text-white tracking-wider mt-0.5">
                {timeRemainingStr || '--:--:--'}
              </span>
            </div>
          </div>

          {/* Cards Sold Progress Meter */}
          <div className="p-4 rounded-2xl bg-[#141414] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-arcade font-bold text-white/70 uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>CARDS SOLD: <strong className="text-white">{cardsSold} / {maxCards}</strong></span>
              </span>
              <span className={`font-arcade font-bold text-[11px] px-2 py-0.5 rounded-full ${cardsSold >= minCards ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {cardsSold >= minCards ? '✅ THRESHOLD REACHED' : `⚠️ NEED ${minCards - cardsSold} MORE`}
              </span>
            </div>

            <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 relative">
              {/* 50% Marker for 100 cards threshold */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-amber-400/80 z-10" title="Min 100 Cards Required" />
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>0 Cards</span>
              <span className="text-amber-300 font-bold">100 Cards (Min to Start)</span>
              <span>200 Cards (Max Cap)</span>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <button
              onClick={() => setActiveSubTab('catalog')}
              className={`px-3 py-1.5 rounded-xl font-arcade text-xs font-bold transition-colors cursor-pointer ${
                activeSubTab === 'catalog'
                  ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : 'bg-[#181818] text-white/60 hover:text-white'
              }`}
            >
              CARD CATALOG (1–200)
            </button>
            <button
              onClick={() => setActiveSubTab('my_cards')}
              className={`px-3 py-1.5 rounded-xl font-arcade text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'my_cards'
                  ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : 'bg-[#181818] text-white/60 hover:text-white'
              }`}
            >
              <span>MY CARDS</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px]">
                {myTickets.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('rules')}
              className={`px-3 py-1.5 rounded-xl font-arcade text-xs font-bold transition-colors cursor-pointer ${
                activeSubTab === 'rules'
                  ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : 'bg-[#181818] text-white/60 hover:text-white'
              }`}
            >
              RULES & SCHEDULE
            </button>
          </div>

          {/* Sub-Tab 1: Card Selection Catalog */}
          {activeSubTab === 'catalog' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Select one or more cards to enter today's jackpot:</span>
                <span className="font-arcade text-[11px] text-amber-400">
                  {selectedNumbers.length} SELECTED
                </span>
              </div>

              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-64 overflow-y-auto p-1 custom-scrollbar">
                  {cards.map(card => {
                    const isSelected = selectedNumbers.includes(card.cardNumber);
                    const isTaken = card.isTaken;
                    const isMine = card.isOwnedByMe;

                    let btnClass = 'bg-[#181818] text-white/80 hover:border-amber-400/60 border-white/10';
                    if (isMine) {
                      btnClass = 'bg-emerald-950 border-emerald-500 text-emerald-300 font-black cursor-not-allowed';
                    } else if (isTaken) {
                      btnClass = 'bg-black/60 border-white/5 text-white/20 cursor-not-allowed';
                    } else if (isSelected) {
                      btnClass = 'bg-amber-500 text-black border-amber-300 font-black shadow-[0_0_10px_rgba(245,158,11,0.5)]';
                    }

                    return (
                      <button
                        key={card.cardNumber}
                        disabled={isTaken}
                        onClick={() => handleToggleCard(card.cardNumber, isTaken)}
                        className={`h-11 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer text-xs font-mono relative ${btnClass}`}
                      >
                        <span className="font-bold">#{card.cardNumber}</span>
                        {isMine && <span className="text-[8px] font-arcade uppercase text-emerald-400">OWN</span>}
                        {isTaken && !isMine && <Lock className="w-2.5 h-2.5 text-white/30" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 2: My Purchased Cards */}
          {activeSubTab === 'my_cards' && (
            <div className="space-y-3">
              {myTickets.length === 0 ? (
                <div className="p-8 text-center text-white/40 space-y-2">
                  <Trophy className="w-10 h-10 mx-auto text-white/20" />
                  <p className="text-xs">You have not purchased any cards for this Daily Grand Jackpot round yet.</p>
                  <button
                    onClick={() => setActiveSubTab('catalog')}
                    className="text-xs text-amber-400 hover:underline font-arcade uppercase"
                  >
                    Select cards from catalog →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto custom-scrollbar">
                  {myTickets.map(t => (
                    <div key={t.id} className="p-3 rounded-2xl bg-[#141414] border border-emerald-500/40 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-arcade font-bold text-white">CARD #{t.card_number}</span>
                        <span className="text-[10px] text-emerald-400 font-bold">ENTERED</span>
                      </div>
                      <div className="text-[10px] text-white/50 truncate">
                        ID: {t.id}
                      </div>
                      <div className="text-[10px] text-white/40">
                        {new Date(t.purchased_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 3: Rules & Schedule */}
          {activeSubTab === 'rules' && (
            <div className="p-4 rounded-2xl bg-[#141414] border border-white/10 space-y-3 text-xs text-white/70 leading-relaxed">
              <h4 className="font-arcade text-sm font-black text-white uppercase flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                <span>DAILY GRAND JACKPOT RULES</span>
              </h4>
              <ul className="space-y-2 list-disc pl-4 text-white/80">
                <li><strong>Schedule:</strong> Drawn every single day at <strong>12:00 PM (Africa/Addis_Ababa)</strong>.</li>
                <li><strong>Card Price:</strong> Fixed at <strong>999 ETB</strong> per ticket.</li>
                <li><strong>Catalog:</strong> Exactly <strong>200 cards</strong> available per round.</li>
                <li><strong>Minimum Threshold:</strong> At least <strong>100 cards</strong> must be purchased by 12:00 PM to initiate the draw.</li>
                <li><strong>Postponement:</strong> If fewer than 100 cards are sold at 12:00 PM, the draw is postponed. Purchased cards remain active and registration continues until 12:00 PM tomorrow.</li>
                <li><strong>Prize Pot:</strong>
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-white/70">
                    <li>100–110 cards: <strong>100,000 ETB</strong> guaranteed winner pot.</li>
                    <li>111–160 cards: Scales with ticket sales (Gross Sales - 10,000 ETB).</li>
                    <li>161–200 cards: Maximum capped at <strong>150,000 ETB</strong>!</li>
                  </ul>
                </li>
                <li><strong>Provably Fair:</strong> Ball draws are generated server-side using cryptographic commitment hashes.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Sticky Purchase Footer Drawer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-[#121212] flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <div>
              <span className="text-[10px] font-arcade text-white/50 uppercase block">
                Total Investment
              </span>
              <span className="font-arcade text-xl sm:text-2xl font-black text-amber-300">
                {((totalCost ?? 0)).toLocaleString()} BIRR
              </span>
            </div>

            <div className="border-l border-white/10 pl-4">
              <span className="text-[10px] font-arcade text-white/50 uppercase block">
                Wallet Balance
              </span>
              <span className="text-sm font-bold text-white flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5 text-white/40" />
                <span>{((userBalance ?? 0)).toLocaleString()} Birr</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!hasEnoughBalance && totalCost > 0 && (
              <button
                onClick={onOpenWallet}
                className="btn-dark-arcade text-xs py-3 px-4 rounded-xl flex-1 sm:flex-none whitespace-nowrap"
              >
                + DEPOSIT
              </button>
            )}

            <button
              disabled={selectedNumbers.length === 0 || purchasing}
              onClick={handlePurchase}
              className={`btn-neon text-sm py-3 px-6 rounded-2xl flex-1 sm:flex-none flex items-center justify-center gap-2 font-arcade font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer ${
                selectedNumbers.length === 0 || purchasing
                  ? 'opacity-50 cursor-not-allowed bg-gray-800 text-white/40 border-transparent shadow-none'
                  : 'bg-gradient-to-r from-amber-400 to-yellow-300 text-black border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.5)]'
              }`}
            >
              {purchasing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>SECURING CARDS...</span>
                </>
              ) : (
                <>
                  <span>CONFIRM & ENTER ({selectedNumbers.length})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
