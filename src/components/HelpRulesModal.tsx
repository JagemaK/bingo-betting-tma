import React from 'react';
import { HelpCircle, Grid, Trophy, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { ModalHeader } from './ModalHeader.js';

interface HelpRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  minPlayers?: number;
  maxCards?: number;
  totalCards?: number;
  lobbySeconds?: number;
  claimSeconds?: number;
  autoCalls?: number;
  commissionPercent?: number;
}

export const HelpRulesModal: React.FC<HelpRulesModalProps> = ({
  isOpen,
  onClose,
  minPlayers = 2,
  maxCards = 5,
  totalCards = 200,
  lobbySeconds = 30,
  claimSeconds = 5,
  autoCalls = 3,
  commissionPercent = 20
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="HOW TO PLAY"
          badge="75-BALL BINGO"
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
              1. Your Cartela ({totalCards} Numbered Cards)
            </h3>
          </div>
          <p className="text-xs font-arcade text-white/70 leading-relaxed">
            A cartela is a 5x5 card with 24 numbers and a FREE middle square. Each column only holds numbers from its letter:
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

        {/* Section 2: How a round works */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              2. How A Round Works
            </h3>
          </div>
          <ol className="space-y-2 font-arcade text-xs list-none">
            {[
              ['PICK YOUR CARTELA', `Choose up to ${maxCards} numbered cartelas (1-${totalCards}). A cartela number always has the same numbers, so you can keep your lucky one. You can change your mind and get your money back until the draw starts.`],
              ['WAIT FOR PLAYERS', `When ${minPlayers} or more players have joined, a ${lobbySeconds}-second countdown starts. If players leave and fewer than ${minPlayers} remain, it waits again.`],
              ['WATCH THE BALLS', 'Balls from 1 to 75 are called one by one (B 1-15, I 16-30, N 31-45, G 46-60, O 61-75). Numbers on your cartela are marked for you. The middle square is FREE.'],
              ['PRESS BINGO', 'When you complete a winning pattern, the BINGO button lights up. Press it! The first BINGO wins the prize.'],
              ['SAME BALL = SHARED PRIZE', `After the first BINGO the game pauses for ${claimSeconds} seconds. Everyone else who also has BINGO can press then, and the prize is split equally between those cartelas.`],
              ['DON\'T MISS IT', `If your cartela has BINGO and nobody presses within ${autoCalls} more balls, the game calls BINGO for you.`]
            ].map(([title, body], i) => (
              <li key={title} className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
                <div className="font-black text-[#E8FF00]">{i + 1}. {title}</div>
                <div className="text-[10px] text-white/60 mt-0.5 leading-relaxed">{body}</div>
              </li>
            ))}
          </ol>
        </div>

        {/* Section 3: Winning Patterns */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <Trophy className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              3. Winning Patterns
            </h3>
          </div>
          <div className="space-y-2 font-arcade text-xs">
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-[#E8FF00]">ANY STRAIGHT LINE</div>
              <div className="text-[10px] text-white/50 mt-0.5">All 5 squares of a row, a column, or a corner-to-corner diagonal. The FREE middle square counts.</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-[#E8FF00]">FOUR CORNERS</div>
              <div className="text-[10px] text-white/50 mt-0.5">The four outer corner squares of your cartela.</div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30">
              <div className="font-black text-rose-300">FALSE BINGO = OUT</div>
              <div className="text-[10px] text-white/60 mt-0.5">A BINGO without a finished pattern puts that cartela out for the rest of the round. Your other cartelas keep playing.</div>
            </div>
          </div>
        </div>

        {/* Section 4: Payout Structure */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              4. The Prize (Derash)
            </h3>
          </div>
          <div className="space-y-2 font-arcade text-xs">
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 flex items-center justify-between gap-2">
              <div>
                <div className="font-black text-white">PRIZE</div>
                <div className="text-[9px] text-white/40">All cartela stakes in the round, minus {commissionPercent}% commission</div>
              </div>
              <span className="font-black text-[#E8FF00] shrink-0">{100 - commissionPercent}% TO WINNERS</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#181818] border border-[#E8FF00]/40 flex items-center justify-between gap-2 shadow-[0_0_10px_rgba(232,255,0,0.15)]">
              <div>
                <div className="font-black text-[#E8FF00] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>SMALL ROUND PROMO</span>
                </div>
                <div className="text-[9px] text-white/60">5 cartelas or fewer in the round: no commission at all</div>
              </div>
              <span className="font-black text-[#E8FF00] shrink-0">100% POT</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <div className="font-black text-white">NO WINNER?</div>
              <div className="text-[9px] text-white/40">If no cartela can win (for example every cartela was put out), every stake is refunded.</div>
            </div>
          </div>
        </div>

        {/* Section 5: Fairness */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E8FF00]/15 text-[#E8FF00] flex items-center justify-center border border-[#E8FF00]/30">
              <HelpCircle className="w-4 h-4" />
            </div>
            <h3 className="font-arcade font-black text-sm text-white uppercase">
              5. Certified Fairness
            </h3>
          </div>
          <p className="text-xs font-arcade text-white/60 leading-relaxed">
            The order of all 75 balls is locked with a SHA-256 fingerprint before ball #1 is drawn and revealed when the round ends, so anyone can check that nothing was changed.
          </p>
        </div>
      </main>
    </div>
  </div>
  );
};
