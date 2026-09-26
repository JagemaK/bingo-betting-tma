import React, { useState } from 'react';
import { Headphones, Send, MessageCircle, HelpCircle, CheckCircle2, X, ExternalLink, ArrowLeft } from 'lucide-react';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { ModalHeader } from './ModalHeader.js';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitted(true);
    soundService.playLineChime();
    telegramSdk.triggerHaptic('success');
    setTimeout(() => {
      setMessage('');
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Ambient Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <ModalHeader
          title="SUPPORT & HELP"
          badge="24/7 LIVE"
          badgeVariant="emerald"
          onClose={onClose}
          closeTitle="Close Support"
        />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 font-arcade w-full">
        {/* Quick Telegram Channels */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href="https://t.me/BingoBetSupport"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-2xl bg-[#111111] hover:bg-[#161616] border border-white/10 hover:border-[#E8FF00]/40 transition-all flex flex-col items-center text-center space-y-1 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#E8FF00]/15 text-[#E8FF00] border border-[#E8FF00]/30 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="font-black text-xs text-white">SUPPORT BOT</div>
            <div className="text-[9px] text-[#E8FF00]">@BingoBetSupport</div>
          </a>

          <a
            href="https://t.me/BingoBetCommunity"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-2xl bg-[#111111] hover:bg-[#161616] border border-white/10 hover:border-[#E8FF00]/40 transition-all flex flex-col items-center text-center space-y-1 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1c1c1c] text-white border border-white/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="font-black text-xs text-white">COMMUNITY</div>
            <div className="text-[9px] text-white/50">@BingoBetCommunity</div>
          </a>
        </div>

        {/* Support Ticket Form */}
        <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-[#E8FF00]" />
            <h3 className="font-black text-xs text-white uppercase">
              DIRECT INQUIRY TICKET
            </h3>
          </div>

          <div>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your phone number or describe your deposit / game inquiry..."
              className="w-full p-3 rounded-xl bg-[#161616] border border-white/10 text-xs text-white focus:outline-none focus:border-[#E8FF00] resize-none placeholder:text-white/30"
            />
          </div>

          <button
            type="submit"
            disabled={submitted || !message.trim()}
            className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-40"
          >
            {submitted ? 'TICKET SUBMITTED TO SUPPORT!' : 'SEND SUPPORT INQUIRY'}
          </button>
        </form>

        {/* FAQ Cards */}
        <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#E8FF00]" />
            <h3 className="font-black text-xs text-white uppercase">
              FREQUENTLY ASKED QUESTIONS
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <span className="font-black text-[#E8FF00] block">How fast are Telebirr deposits?</span>
              <p className="text-[10px] text-white/50 mt-0.5">Deposits credit automatically to your wallet within seconds of payment.</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <span className="font-black text-[#E8FF00] block">How are winnings withdrawn?</span>
              <p className="text-[10px] text-white/50 mt-0.5">Winnings are credited instantly upon BINGO claim and can be withdrawn directly to Telebirr.</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161616] border border-white/5">
              <span className="font-black text-[#E8FF00] block">Is the game provably fair?</span>
              <p className="text-[10px] text-white/50 mt-0.5">Yes! All ball sequences are pre-committed with SHA-256 hashes verifiable in browser.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
  );
};
