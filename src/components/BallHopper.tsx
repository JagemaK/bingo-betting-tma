import React, { useState } from 'react';
import { LayoutGrid, Volume2, VolumeX, Mic, MicOff, X, Zap } from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';

interface BallHopperProps {
  currentBall: { letter: 'B' | 'I' | 'N' | 'G' | 'O'; number: number } | null;
  drawnBalls: number[];
  status: 'lobby' | 'active' | 'finished';
  soundEnabled: boolean;
  voiceCallerEnabled: boolean;
  onToggleSound: () => void;
  onToggleVoice: () => void;
}

const BALL_COLORS: Record<'B' | 'I' | 'N' | 'G' | 'O', {
  accent: string;
  badge: string;
}> = {
  B: { accent: '#38bdf8', badge: 'bg-sky-500/20 text-sky-300 border-sky-400/40' },
  I: { accent: '#a78bfa', badge: 'bg-purple-500/20 text-purple-300 border-purple-400/40' },
  N: { accent: '#E8FF00', badge: 'bg-[#E8FF00]/20 text-[#E8FF00] border-[#E8FF00]/40' },
  G: { accent: '#4ade80', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' },
  O: { accent: '#f43f5e', badge: 'bg-rose-500/20 text-rose-300 border-rose-400/40' },
};

function getBallLetter(num: number): 'B' | 'I' | 'N' | 'G' | 'O' {
  if (num >= 1  && num <= 15) return 'B';
  if (num >= 16 && num <= 30) return 'I';
  if (num >= 31 && num <= 45) return 'N';
  if (num >= 46 && num <= 60) return 'G';
  return 'O';
}

export const BallHopper: React.FC<BallHopperProps> = ({
  currentBall,
  drawnBalls,
  status,
  soundEnabled,
  voiceCallerEnabled,
  onToggleSound,
  onToggleVoice,
}) => {
  const [showMasterBoard, setShowMasterBoard] = useState(false);

  const calledSet = new Set(drawnBalls);
  const recentBalls = drawnBalls.slice(-5, -1).reverse();

  const colB = Array.from({ length: 15 }, (_, i) => i + 1);
  const colI = Array.from({ length: 15 }, (_, i) => i + 16);
  const colN = Array.from({ length: 15 }, (_, i) => i + 31);
  const colG = Array.from({ length: 15 }, (_, i) => i + 46);
  const colO = Array.from({ length: 15 }, (_, i) => i + 61);

  const isActive = status === 'active';

  return (
    <div className="w-full rounded-3xl overflow-hidden border border-white/10 bg-[#111111] shadow-[0_8px_24px_rgba(0,0,0,0.7)] relative">
      {/* Top Arcade Status Bar */}
      <div className="relative z-10 flex items-center justify-between px-3 sm:px-3.5 py-2 bg-[#161616] border-b border-white/10 min-w-0">
        {/* Status indicator & Progress */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 mr-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isActive ? 'bg-[#E8FF00] shadow-[0_0_8px_rgba(232,255,0,0.8)] animate-pulse' : 'bg-white/30'
            }`} />
            <span className="font-arcade font-black text-[11px] sm:text-xs uppercase tracking-wider text-white truncate whitespace-nowrap min-w-0">
              {isActive ? 'LIVE CALL' : status === 'lobby' ? 'WAITING' : 'ROUND FINISHED'}
            </span>
          </div>

          <div className="font-arcade text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white/70 shrink-0 whitespace-nowrap">
            <span className="text-[#E8FF00]">{drawnBalls.length}</span> / 75
          </div>
        </div>

        {/* Audio & Master Board Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              onToggleSound();
              telegramSdk.triggerHaptic('light');
            }}
            title={soundEnabled ? 'Mute SFX' : 'Enable SFX'}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
          >
            {soundEnabled
              ? <Volume2 className="w-3.5 h-3.5 text-[#E8FF00]" />
              : <VolumeX className="w-3.5 h-3.5 text-white/30" />
            }
          </button>

          <button
            onClick={() => {
              onToggleVoice();
              telegramSdk.triggerHaptic('light');
            }}
            title={voiceCallerEnabled ? 'Mute Voice' : 'Enable Voice'}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
          >
            {voiceCallerEnabled
              ? <Mic className="w-3.5 h-3.5 text-[#E8FF00]" />
              : <MicOff className="w-3.5 h-3.5 text-white/30" />
            }
          </button>

          <button
            onClick={() => {
              setShowMasterBoard(!showMasterBoard);
              soundService.playClick();
              telegramSdk.triggerHaptic('light');
            }}
            className={`flex items-center gap-1 text-[11px] font-arcade font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
              showMasterBoard
                ? 'bg-[#E8FF00] text-black border-[#E8FF00] shadow-[0_0_10px_rgba(232,255,0,0.4)]'
                : 'bg-black/40 text-white/70 hover:text-white border-white/10'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            <span>BOARD</span>
          </button>
        </div>
      </div>

      {/* Main Hopper Stage: Big Arcade Ball + Recent History */}
      <div className="p-3.5 flex items-center gap-3.5">
        {/* Giant Active Arcade Ball */}
        <div className="flex-shrink-0">
          {currentBall && isActive ? (
            <div
              key={`${currentBall.letter}-${currentBall.number}`}
              className="w-20 h-20 rounded-2xl bg-[#1a1a1a] border-2 border-[#E8FF00] shadow-[0_0_25px_rgba(232,255,0,0.4)] flex flex-col items-center justify-center relative overflow-hidden animate-ball-drop"
            >
              {/* Corner decorative light */}
              <div className="absolute top-0 right-0 w-8 h-8 bg-[#E8FF00]/15 rounded-bl-full pointer-events-none" />
              
              <span
                className="font-arcade font-black text-xs uppercase tracking-widest leading-none mb-1"
                style={{ color: BALL_COLORS[currentBall.letter].accent }}
              >
                {currentBall.letter}
              </span>
              <span className="font-arcade font-black text-3xl leading-none text-[#E8FF00] drop-shadow-[0_0_10px_rgba(232,255,0,0.6)]">
                {currentBall.number}
              </span>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-[#161616] border border-white/10 flex flex-col items-center justify-center">
              <span className="font-arcade text-[9px] font-bold text-white/40 uppercase tracking-widest">READY</span>
              <span className="font-arcade text-xl font-black text-white/20">--</span>
            </div>
          )}
        </div>

        {/* Recent Balls Stream & Letter Ribbon */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* B-I-N-G-O Alphabet Indicator */}
          <div className="flex items-center justify-between gap-1">
            <span className="font-arcade text-[10px] font-bold uppercase tracking-wider text-white/40">
              RECENT CALLS
            </span>

            <div className="flex items-center gap-1">
              {(['B', 'I', 'N', 'G', 'O'] as const).map((letter) => {
                const isCurrent = currentBall?.letter === letter && isActive;
                return (
                  <span
                    key={letter}
                    className={`font-arcade font-black text-[10px] px-1.5 py-0.5 rounded transition-all ${
                      isCurrent
                        ? 'bg-[#E8FF00] text-black shadow-[0_0_8px_rgba(232,255,0,0.6)]'
                        : 'bg-black/30 text-white/30 border border-white/5'
                    }`}
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Mini Recent Balls Queue */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {recentBalls.length > 0 ? (
              recentBalls.map((num, idx) => {
                const letter = getBallLetter(num);
                const color = BALL_COLORS[letter];
                return (
                  <div
                    key={`${num}-${idx}`}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#161616] border border-white/15 flex flex-col items-center justify-center shadow-sm"
                    style={{ opacity: 1 - idx * 0.18 }}
                  >
                    <span
                      className="font-arcade font-bold text-[8px] leading-none uppercase"
                      style={{ color: color.accent }}
                    >
                      {letter}
                    </span>
                    <span className="font-arcade font-black text-xs text-white leading-none mt-0.5">
                      {num}
                    </span>
                  </div>
                );
              })
            ) : (
              <span className="font-arcade text-xs text-white/30">Waiting for first ball...</span>
            )}
          </div>
        </div>
      </div>

      {/* Popout 1-75 Master Board Modal */}
      {showMasterBoard && (
        <div className="p-3 border-t border-white/10 bg-[#0c0c0c] space-y-2 min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="font-arcade text-xs font-black uppercase text-[#E8FF00] tracking-wider truncate whitespace-nowrap min-w-0 mr-2">
              FULL MASTER BOARD (75 NUMBERS)
            </span>
            <button
              onClick={() => setShowMasterBoard(false)}
              className="p-1 text-white/40 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {[
              { letter: 'B', nums: colB, color: BALL_COLORS.B.accent },
              { letter: 'I', nums: colI, color: BALL_COLORS.I.accent },
              { letter: 'N', nums: colN, color: BALL_COLORS.N.accent },
              { letter: 'G', nums: colG, color: BALL_COLORS.G.accent },
              { letter: 'O', nums: colO, color: BALL_COLORS.O.accent },
            ].map(({ letter, nums, color }) => (
              <div key={letter} className="flex items-center gap-1">
                <div
                  className="w-5 h-5 rounded font-arcade font-black text-[10px] flex items-center justify-center bg-[#1a1a1a] flex-shrink-0"
                  style={{ color }}
                >
                  {letter}
                </div>
                <div className="flex-1 grid grid-cols-15 gap-0.5">
                  {nums.map((n) => {
                    const isDrawn = calledSet.has(n);
                    const isCurrent = currentBall?.number === n;
                    return (
                      <div
                        key={n}
                        className={`text-center font-arcade text-[9px] py-0.5 rounded transition-all ${
                          isCurrent
                            ? 'bg-[#E8FF00] text-black font-black shadow-[0_0_8px_rgba(232,255,0,0.6)] scale-110'
                            : isDrawn
                            ? 'bg-[#E8FF00]/20 text-[#E8FF00] border border-[#E8FF00]/40 font-bold'
                            : 'bg-white/[0.03] text-white/30 border border-white/5'
                        }`}
                      >
                        {n}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
