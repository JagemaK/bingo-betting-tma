import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  Gift,
  Trophy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Clock,
  Coins,
  ArrowRight,
  ExternalLink,
  Flame,
  Layers,
  HeartHandshake
} from 'lucide-react';

interface BettingDescriptionSectionProps {
  onOpenRules?: () => void;
  onOpenProvablyFair?: () => void;
  onOpenReferral?: () => void;
  onOpenWallet?: () => void;
}

export const BettingDescriptionSection: React.FC<BettingDescriptionSectionProps> = ({
  onOpenRules,
  onOpenProvablyFair,
  onOpenReferral,
  onOpenWallet,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      q: 'How does 75-Ball Ethiopian Bingo betting work?',
      a: 'Pick up to 5 numbered cartelas (each number always has the same card). When at least 2 players have joined, a short countdown starts and balls 1 to 75 are called one by one (B1-15, I16-30, N31-45, G46-60, O61-75). Your numbers are marked for you. Finish any row, column, diagonal or the 4 corners and press BINGO. If several cartelas get BINGO on the same ball, the prize is shared equally. A false BINGO puts that cartela out for the round.'
    },
    {
      q: 'How fast are deposits and withdrawals processed with Telebirr & CBE?',
      a: 'Deposits are credited instantly to your in-app wallet via Telebirr or Commercial Bank of Ethiopia (CBE). Withdrawals are automated and sent directly to your registered mobile phone number within 1 to 5 minutes with zero withdrawal commission.'
    },
    {
      q: 'What is the small-round Zero Commission Promo?',
      a: 'Whenever a round has 5 cartelas or fewer, the house takes no commission. 100% of all stakes go to the winner (or are shared between winners on the same ball).'
    },
    {
      q: 'How do I know the game is Provably Fair and not rigged?',
      a: 'Every round’s complete 75-ball sequence and server seed are cryptographically hashed using SHA-256 before the very first ball is drawn. Once the round finishes, the server seed is revealed so you can independently recalculate and verify the hash in your browser.'
    },
    {
      q: 'Can I win without manually marking every single called number?',
      a: 'Yes! Our smart Auto-Daub engine automatically marks drawn numbers on all your active cards in real-time. Even if you experience connection hiccups, our server-side claim engine ensures your winning ticket is credited automatically.'
    }
  ];

  return (
    <section className="w-full mt-12 space-y-12 border-t border-white/[0.08] pt-12 select-none" aria-label="About Our Betting Platform">
      {/* ══════════════════════════════════════════════════ */}
      {/* 1. HERO BRAND INTRO & OVERVIEW                    */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="relative rounded-3xl p-6 sm:p-10 bg-gradient-to-br from-[#141609] via-[#0f0f0f] to-[#0a0a0a] border border-[#E8FF00]/30 shadow-[0_0_40px_rgba(232,255,0,0.1)] overflow-hidden">
        {/* Glow corner aura */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#E8FF00]/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8FF00]/10 border border-[#E8FF00]/30">
            <Sparkles className="w-3.5 h-3.5 text-[#E8FF00]" />
            <span className="font-arcade text-xs font-black text-[#E8FF00] uppercase tracking-wider">
              ETHIOPIA'S #1 LIVE MULTIPLAYER BINGO BETTING
            </span>
          </div>

          <h2 className="font-arcade font-black text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight uppercase leading-tight">
            ABOUT BINGO BET — REAL BIRR, REAL MULTIPLAYER, PROVABLY FAIR
          </h2>

          <p className="font-arcade text-xs sm:text-sm text-white/70 leading-relaxed">
            Welcome to <strong className="text-white">BINGO BET</strong> (በኢትዮጵያ ቀዳሚው የቀጥታ ቢንጎ መወራረጃ ፕላትፎርም), 
            the premier destination for online Ethiopian 75-Ball Bingo. We combine traditional Habesha coffee-house bingo excitement 
            with cutting-edge real-time WebSockets, verified SHA-256 cryptographic fairness, and instant 
            Telebirr and CBE mobile payments. Play against hundreds of live competitors across Addis Ababa, 
            Hawassa, Gondar, and worldwide!
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-arcade font-bold text-white/80">
              <CheckCircle2 className="w-4 h-4 text-[#E8FF00]" />
              <span>Instant Telebirr Cashout</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-arcade font-bold text-white/80">
              <CheckCircle2 className="w-4 h-4 text-[#E8FF00]" />
              <span>SHA-256 Cryptographic Audit</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-arcade font-bold text-white/80">
              <CheckCircle2 className="w-4 h-4 text-[#E8FF00]" />
              <span>Small-Round Zero Commission Promo</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-arcade font-bold text-white/80">
              <CheckCircle2 className="w-4 h-4 text-[#E8FF00]" />
              <span>Auto-Daub Smart Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 2. THE FOUR PILLARS OF OUR BETTING PLATFORM        */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <span className="text-[10px] font-arcade font-bold text-[#E8FF00] uppercase tracking-widest block">
              WHY PLAYERS CHOOSE US
            </span>
            <h3 className="font-arcade font-black text-xl sm:text-2xl text-white uppercase tracking-tight">
              THE BINGO BET ADVANTAGE
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all space-y-3 shadow-sm group">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#E8FF00] group-hover:bg-[#E8FF00] group-hover:text-black transition-colors">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="font-arcade font-black text-sm text-white uppercase tracking-wide">
              Instant Telebirr & CBE
            </h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Deposit and withdraw Ethiopian Birr directly with Telebirr and CBE. Payouts are credited to your balance instantly upon round completion.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all space-y-3 shadow-sm group">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#E8FF00] group-hover:bg-[#E8FF00] group-hover:text-black transition-colors">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="font-arcade font-black text-sm text-white uppercase tracking-wide">
              100% Provably Fair
            </h4>
            <p className="text-xs text-white/60 leading-relaxed">
              All ball sequences are locked with SHA-256 cryptographic commitments before ball #1 is drawn. Audit every draw independently in your browser.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all space-y-3 shadow-sm group">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#E8FF00] group-hover:bg-[#E8FF00] group-hover:text-black transition-colors">
              <Gift className="w-6 h-6" />
            </div>
            <h4 className="font-arcade font-black text-sm text-white uppercase tracking-wide">
              Small-Round 0% Commission Promo
            </h4>
            <p className="text-xs text-white/60 leading-relaxed">
              When a round has 5 cartelas or fewer, 100% of all stakes go to the winner! The platform takes no commission.
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 hover:border-[#E8FF00]/40 transition-all space-y-3 shadow-sm group">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#E8FF00] group-hover:bg-[#E8FF00] group-hover:text-black transition-colors">
              <Trophy className="w-6 h-6" />
            </div>
            <h4 className="font-arcade font-black text-sm text-white uppercase tracking-wide">
              Pari-Mutuel Jackpots
            </h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Pot sizes scale with every ticket sold. The more players join the room, the larger the payout pool climbs, with jackpots reaching 250,000+ Birr!
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 3. STEP-BY-STEP: HOW TO PLAY & BET                 */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <span className="text-[10px] font-arcade font-bold text-[#E8FF00] uppercase tracking-widest block">
              QUICK START GUIDE
            </span>
            <h3 className="font-arcade font-black text-xl sm:text-2xl text-white uppercase tracking-tight">
              HOW BINGO BETTING WORKS (4 EASY STEPS)
            </h3>
          </div>
          {onOpenRules && (
            <button
              onClick={onOpenRules}
              className="text-xs font-arcade font-bold text-[#E8FF00] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>FULL RULES</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#111111] border border-white/10 space-y-2 relative">
            <span className="font-arcade font-black text-3xl text-[#E8FF00]/20 absolute top-3 right-4">
              01
            </span>
            <div className="font-arcade font-black text-xs text-[#E8FF00] uppercase">STEP 1</div>
            <h4 className="font-arcade font-black text-sm text-white uppercase">Choose a Room</h4>
            <p className="text-xs text-white/60">
              Pick your preferred stake tier: 10 Birr, 20 Birr, 50 Birr, or 100 Birr VIP room depending on your bankroll.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#111111] border border-white/10 space-y-2 relative">
            <span className="font-arcade font-black text-3xl text-[#E8FF00]/20 absolute top-3 right-4">
              02
            </span>
            <div className="font-arcade font-black text-xs text-[#E8FF00] uppercase">STEP 2</div>
            <h4 className="font-arcade font-black text-sm text-white uppercase">Select Your Cards</h4>
            <p className="text-xs text-white/60">
              Browse through up to 200 cards in the matrix. Select your favorite lucky card numbers or tap "Lucky Pick" to lock cards.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#111111] border border-white/10 space-y-2 relative">
            <span className="font-arcade font-black text-3xl text-[#E8FF00]/20 absolute top-3 right-4">
              03
            </span>
            <div className="font-arcade font-black text-xs text-[#E8FF00] uppercase">STEP 3</div>
            <h4 className="font-arcade font-black text-sm text-white uppercase">Live Ball Draw</h4>
            <p className="text-xs text-white/60">
              Watch the hopper draw balls live. Turn on Auto-Daub to automatically mark your cards as numbers are announced.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#111111] border border-white/10 space-y-2 relative">
            <span className="font-arcade font-black text-3xl text-[#E8FF00]/20 absolute top-3 right-4">
              04
            </span>
            <div className="font-arcade font-black text-xs text-[#E8FF00] uppercase">STEP 4</div>
            <h4 className="font-arcade font-black text-sm text-white uppercase">Instant Cashout</h4>
            <p className="text-xs text-white/60">
              Complete any horizontal line, vertical column, diagonal line, or 4 corners to claim BINGO! Winnings land instantly in your wallet.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 4. POOL DISTRIBUTION & TRANSPARENCY                */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#111111] border border-white/10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-arcade font-bold text-[#E8FF00] uppercase tracking-widest block">
              100% TRANSPARENT ECONOMICS
            </span>
            <h3 className="font-arcade font-black text-lg sm:text-xl text-white uppercase">
              PARI-MUTUEL JACKPOT PRIZE DISTRIBUTION
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {onOpenProvablyFair && (
              <button
                onClick={onOpenProvablyFair}
                className="btn-dark-arcade px-3.5 py-1.5 rounded-xl text-xs font-arcade font-bold uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#E8FF00]" />
                <span>AUDIT FAIRNESS</span>
              </button>
            )}
            {onOpenReferral && (
              <button
                onClick={onOpenReferral}
                className="btn-neon px-3.5 py-1.5 rounded-xl text-xs font-arcade font-black uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <Gift className="w-3.5 h-3.5" />
                <span>EARN 5% REFERRAL</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#161616] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-arcade font-black text-xs text-white uppercase">
                STANDARD POOL (&gt; 5 CARDS)
              </span>
              <span className="text-xs font-arcade font-black text-[#E8FF00]">80%</span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              80% of all cartela stakes go to the winner (shared equally if several cartelas call BINGO on the same ball). 20% commission covers room maintenance and server hosting.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#181907] border border-[#E8FF00]/40 space-y-2 shadow-[0_0_15px_rgba(232,255,0,0.1)]">
            <div className="flex items-center justify-between">
              <span className="font-arcade font-black text-xs text-[#E8FF00] uppercase flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" />
                <span>5-PLAYER SPECIAL PROMO</span>
              </span>
              <span className="text-xs font-arcade font-black text-[#E8FF00]">100%</span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              When a round has 5 cartelas or fewer, 100% of all stakes go directly to the winner. Zero commission taken by the platform!
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#161616] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-arcade font-black text-xs text-white uppercase">
                AFFILIATE REVENUE SHARE
              </span>
              <span className="text-xs font-arcade font-black text-emerald-400">5% FOR LIFE</span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Invite your friends and community. Receive 5% lifetime revenue share on every single ticket bought by your referrals, paid straight to your balance.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 5. FREQUENTLY ASKED QUESTIONS (FAQ)                */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <HelpCircle className="w-5 h-5 text-[#E8FF00]" />
          <h3 className="font-arcade font-black text-xl sm:text-2xl text-white uppercase tracking-tight">
            FREQUENTLY ASKED QUESTIONS (FAQ)
          </h3>
        </div>

        <div className="space-y-2.5">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#121212] border border-white/10 overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 hover:bg-white/[0.02] cursor-pointer"
                >
                  <span className="font-arcade font-bold text-xs sm:text-sm text-white">
                    {faq.q}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#E8FF00] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs font-arcade text-white/60 leading-relaxed border-t border-white/5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 6. TRUST & RESPONSIBLE GAMING BADGES               */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="p-6 rounded-2xl bg-[#0e0e0e] border border-white/10 flex flex-wrap items-center justify-around gap-6 text-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-arcade font-black text-xs text-rose-400 border border-rose-400/30">
            18+
          </div>
          <div className="text-left">
            <span className="font-arcade font-black text-xs text-white block">Strictly 18+</span>
            <span className="text-[10px] text-white/40">Responsible Entertainment</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#E8FF00]" />
          <div className="text-left">
            <span className="font-arcade font-black text-xs text-white block">SHA-256 Verified</span>
            <span className="text-[10px] text-white/40">Cryptographic Commitments</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-[#E8FF00]" />
          <div className="text-left">
            <span className="font-arcade font-black text-xs text-white block">Telebirr Direct</span>
            <span className="text-[10px] text-white/40">Instant Mobile Transfers</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HeartHandshake className="w-6 h-6 text-[#E8FF00]" />
          <div className="text-left">
            <span className="font-arcade font-black text-xs text-white block">24/7 Support</span>
            <span className="text-[10px] text-white/40">Telegram & Live Chat</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 7. FOOTER COPYRIGHT & LEGAL                        */}
      {/* ══════════════════════════════════════════════════ */}
      <footer className="pt-6 pb-12 border-t border-white/5 text-center text-xs text-white/40 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-[#E8FF00] text-black flex items-center justify-center font-arcade font-black text-xs">
            B
          </div>
          <span className="font-arcade font-black text-sm text-white tracking-wider">
            BINGO BET ETHIOPIA
          </span>
        </div>
        <p className="max-w-xl mx-auto text-[11px] text-white/40">
          © 2026 BINGO BET. All rights reserved. The premier live Ethiopian 75-Ball Bingo gaming platform. 
          Play responsibly. Certified Provably Fair SHA-256.
        </p>
      </footer>
    </section>
  );
};
