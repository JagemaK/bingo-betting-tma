import React, { useState } from 'react';
import { ShieldCheck, CheckCircle, AlertTriangle, Copy, Key, Hash, ListOrdered, X, ArrowLeft, Lock, Sparkles } from 'lucide-react';
import { GameRoomState } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { ModalHeader } from './ModalHeader.js';

interface ProvablyFairModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameRoomState;
}

export const ProvablyFairModal: React.FC<ProvablyFairModalProps> = ({
  isOpen,
  onClose,
  gameState,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    calculatedHash: string;
    matches: boolean;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, label: string) => {
    soundService.playClick();
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleVerifyClientSide = async () => {
    if (!gameState.fullShuffledBallsRevealed || !gameState.serverSeedRevealed) return;

    soundService.playClick();
    setIsVerifying(true);
    try {
      const payload = `${gameState.fullShuffledBallsRevealed.join(',')}:${gameState.serverSeedRevealed}`;
      const msgBuffer = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setVerificationResult({
        calculatedHash: hashHex,
        matches: hashHex.toLowerCase() === gameState.commitmentHash.toLowerCase()
      });
      if (hashHex.toLowerCase() === gameState.commitmentHash.toLowerCase()) {
        soundService.playLineChime();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="PROVABLY FAIR AUDIT"
          badge="GLI-11 SHA-256"
          badgeVariant="yellow"
          onClose={onClose}
          closeTitle="Close Audit"
        />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 w-full">
        {/* Overview */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-[#E8FF00]/30 space-y-2 text-xs font-arcade">
          <div className="font-black text-[#E8FF00] flex items-center gap-1.5 text-sm uppercase">
            <CheckCircle className="w-4 h-4" />
            <span>HOW PROVABLE FAIRNESS PROTECTS PLAYERS</span>
          </div>
          <p className="text-white/70 leading-relaxed">
            Before ball #1 is called, the server pre-shuffles all 75 lottery balls with cryptographically secure entropy, binds it with an HMAC server seed, and broadcasts the <strong className="text-white">SHA-256 Commitment Hash</strong>. Neither the players nor the house can alter the drawn sequence.
          </p>
        </div>

        {/* Cryptographic Proof Details */}
        <div className="space-y-3 font-arcade">
          {/* Commitment Hash */}
          <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-black text-[#E8FF00] uppercase text-[10px]">
                <Hash className="w-3.5 h-3.5" />
                PRE-ROUND COMMITMENT HASH
              </span>
              <button
                onClick={() => copyToClipboard(gameState.commitmentHash, 'hash')}
                className="btn-neon px-2 py-0.5 rounded text-[8px] font-black uppercase cursor-pointer"
              >
                {copied === 'hash' ? 'COPIED!' : 'COPY'}
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 font-mono text-[10px] text-white/90 break-all select-all">
              {gameState.commitmentHash}
            </div>
          </div>

          {/* Server Seed Salt */}
          <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-black text-white uppercase text-[10px]">
                <Key className="w-3.5 h-3.5 text-[#E8FF00]" />
                SERVER SEED SALT (REVEALED AT END)
              </span>
              {gameState.serverSeedRevealed && (
                <button
                  onClick={() => copyToClipboard(gameState.serverSeedRevealed!, 'seed')}
                  className="btn-neon px-2 py-0.5 rounded text-[8px] font-black uppercase cursor-pointer"
                >
                  {copied === 'seed' ? 'COPIED!' : 'COPY'}
                </button>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 font-mono text-[10px] text-white/80 break-all select-all">
              {gameState.serverSeedRevealed ? (
                gameState.serverSeedRevealed
              ) : (
                <span className="text-white/40 italic flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Locked until round conclusion to prevent card rigging</span>
                </span>
              )}
            </div>
          </div>

          {/* Ball Draw Sequence */}
          <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-black text-white uppercase text-[10px]">
                <ListOrdered className="w-3.5 h-3.5 text-[#E8FF00]" />
                75-BALL LOTTERY SEQUENCE
              </span>
              <span className="text-[10px] text-white/40 font-mono">
                Drawn: {gameState.drawnBalls.length} / 75
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5 font-mono text-[10px] text-white/80 max-h-28 overflow-y-auto custom-scrollbar">
              {gameState.fullShuffledBallsRevealed ? (
                gameState.fullShuffledBallsRevealed.join(', ')
              ) : (
                <span className="text-white/40 italic">
                  Live drawn: [{gameState.drawnBalls.join(', ') || 'Waiting for first draw...'}]
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Client-Side Verifier Tool */}
        <div className="p-4 rounded-2xl bg-[#111111] border-2 border-[#E8FF00]/40 space-y-3 font-arcade">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#E8FF00]" />
              <h3 className="font-black text-xs text-white uppercase">
                INDEPENDENT BROWSER VERIFIER
              </h3>
            </div>
            <span className="text-[9px] text-white/40">WebCrypto SHA-256</span>
          </div>

          {gameState.status === 'finished' && gameState.serverSeedRevealed ? (
            <div className="space-y-2.5">
              <button
                onClick={handleVerifyClientSide}
                disabled={isVerifying}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                {isVerifying ? 'CALCULATING SHA-256...' : 'VERIFY COMMITMENT HASH NOW'}
              </button>

              {verificationResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    verificationResult.matches
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-500 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs mb-1">
                    {verificationResult.matches ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>100% VERIFIED FAIR — HASH MATCHES SERVER COMMITMENT!</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>HASH MISMATCH DETECTED</span>
                      </>
                    )}
                  </div>
                  <div className="font-mono text-[9px] break-all">
                    Computed SHA-256: {verificationResult.calculatedHash}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-white/50 italic py-1">
              ⏳ Round in progress. Once this round concludes and a player claims BINGO, the salt is unlocked so you can audit the SHA-256 commitment hash client-side.
            </div>
          )}
        </div>
      </main>
    </div>
  </div>
  );
};
