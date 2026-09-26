import React from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { soundService } from '../services/soundService.js';

export interface ModalHeaderProps {
  title: string;
  badge?: string;
  badgeText?: string;
  badgeVariant?: 'yellow' | 'emerald' | 'amber' | 'blue' | 'purple' | 'neutral';
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
  backTitle?: string;
  closeTitle?: string;
  rightAction?: React.ReactNode;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  badge,
  badgeText,
  badgeVariant = 'yellow',
  subtitle,
  onBack,
  onClose,
  backTitle = 'Back',
  closeTitle = 'Close',
  rightAction
}) => {
  const getBadgeClass = () => {
    switch (badgeVariant) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      case 'blue':
        return 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
      case 'purple':
        return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      case 'neutral':
        return 'bg-white/10 text-white/70 border border-white/15';
      case 'yellow':
      default:
        return 'bg-[#E8FF00] text-black';
    }
  };

  const handleBack = () => {
    soundService.playClick();
    if (onBack) onBack();
    else onClose();
  };

  const handleClose = () => {
    soundService.playClick();
    onClose();
  };

  return (
    <header className="relative z-20 w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 bg-[#161616]/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between min-w-0">
      {/* Left: Back Button + Flexible Title & Badge Container */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-xl bg-[#202020] hover:bg-[#282828] text-white/80 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
          title={backTitle}
          aria-label={backTitle}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-arcade font-black text-sm sm:text-base text-white uppercase tracking-wider truncate min-w-0">
              {title}
            </span>
            {(badge || badgeText) && (
              <span
                className={`text-[9px] font-arcade font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap shrink-0 ${getBadgeClass()}`}
              >
                {badge || badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[10px] text-white/50 truncate font-arcade">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right Controls: Optional Extra Action + Fixed Close Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {rightAction}
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#282828] text-white/60 hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
          title={closeTitle}
          aria-label={closeTitle}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
