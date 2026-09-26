import React from 'react';
import { HelpCircle, Grid, Trophy, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { ModalHeader } from './ModalHeader.js';

interface HelpRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpRulesModal: React.FC<HelpRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="RULES & PAYOUTS"
          badge="75-BALL CASINO"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Rules"
        />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {/* Section 1: 5x5 Matrix */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <Grid className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              1. 5x5 Card Matrix (200 Cards)
            </h3>
          </div>
          <p className="text-xs font-arcade text-white/70 leading-relaxed">
            Every room contains 200 certified unique cards. Each card features 24 numbers distributed across standard casino 75-ball columns:
          </p>
          <div className="grid grid-cols-5 gap-1.5 text-center font-arcade font-black text-xs pt-1">
            <div className="p-2 rounded-xl bg-[#181818] text-[#E8FF00] border border-white/10">
              <div className="text-sm">B</div>
              <div className="text-[8px] text-white/50">1-15</div>
            </div>
            <div className="p-2 rounded-xl bg-[#181818] text-[#E8FF00] border border-white/10">
              <div className="text-sm">I</div>
              <div className="text-[8px] text-white/50">16-30</div>
            </div>
            <div className="p-2 rounded-xl bg-[#181818] text-[#E8FF00] border border-white/10">
              <div className="text-sm">N</div>
              <div className="text-[8px] text-white/50">31-45</div>
            </div>
            <div className="p-2 rounded-xl bg-[#181818] text-[#E8FF00] border border-white/10">
              <div className="text-sm">G</div>
              <div className="text-[8px] text-white/50">46-60</div>
            </div>
            <div className="p-2 rounded-xl bg-[#181818] text-[#E8FF00] border border-white/10">
              <div className="text-sm">O</div>
              <div className="text-[8px] text-white/50">61-75</div>
            </div>
          </div>
        </div>

        {/* Section 2: Winning Patterns */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <Trophy className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              2. 1st Player To Hit Wins The Pot!
            </h3>
          </div>
          <div className="space-y-2 font-arcade text-xs">
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-[#E8FF00]">STRAIGHT LINES (Row, Column, Diagonal)</div>
              <div className="text-[10px] text-white/50 mt-0.5">Any 5 numbers in a row, column, or diagonal corner-to-corner.</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-[#E8FF00]">FOUR CORNERS</div>
              <div className="text-[10px] text-white/50 mt-0.5">Daubing the four extreme outer corners of your card.</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-[#E8FF00]">FULL HOUSE / BLACKOUT</div>
              <div className="text-[10px] text-white/50 mt-0.5">Daubing all 24 numbers for the ultimate jackpot payout!</div>
            </div>
          </div>
        </div>

        {/* Section 3: Payout Structure */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              3. Payout Formula & 100% Promo
            </h3>
          </div>
          <div className="space-y-2 font-arcade text-xs">
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 flex items-center justify-between">
              <div>
                <div className="font-black text-white">MINIMUM START THRESHOLD</div>
                <div className="text-[9px] text-white/40">Minimum cards sold to start the draw</div>
              </div>
              <span className="font-black text-[#E8FF00]">5 CARDS</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 flex items-center justify-between">
              <div>
                <div className="font-black text-white">STANDARD WINNER POT (&gt; 5 Cards)</div>
                <div className="text-[9px] text-white/40">80% to winner, 20% platform rake</div>
              </div>
              <span className="font-black text-[#E8FF00]">80% TO WINNER</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#181818] border border-[#E8FF00]/40 flex items-center justify-between shadow-[0_0_10px_rgba(232,255,0,0.15)]">
              <div>
                <div className="font-black text-[#E8FF00] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>5-PLAYER PROMO (EXACTLY 5)</span>
                </div>
                <div className="text-[9px] text-white/60">0% Rake! All stakes paid directly to winner</div>
              </div>
              <span className="font-black text-[#E8FF00]">100% POT</span>
            </div>
          </div>
        </div>

        {/* Section 4: Auto-Daub */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              4. Auto-Daub & Certified Fairness
            </h3>
          </div>
          <p className="text-xs font-arcade text-white/60 leading-relaxed">
            Players can enable Auto-Daub to automatically stamp called numbers in real-time. Every game's ball sequence is locked with a SHA-256 cryptographic hash before ball #1 is drawn.
          </p>
        </div>
      </main>
    </div>
  </div>
  );
};
