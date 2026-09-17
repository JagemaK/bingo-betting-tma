import React, { useState } from 'react';
import {
  X,
  Send,
  Lock,
  Phone,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Bot,
  ExternalLink,
  Crown,
  ArrowLeft
} from 'lucide-react';
import { UserAccount } from '../types/bingo.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';
import { useAuth } from '../services/authContext.js';
import { apiUrl } from '../config/api.js';

export type AuthModalMode =
  | 'teaser'
  | 'register'
  | 'verify'
  | 'welcome'
  | 'login'
  | 'forgot_password'
  | 'reset_verify'
  | 'new_password'
  | 'tg_register';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess: (user: UserAccount, token: string) => void;
  socket?: any;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'register',
  onClose,
  onSuccess,
  socket
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [pendingPhone, setPendingPhone] = useState<string>('');
  const [botUsername, setBotUsername] = useState<string>('BINGOBEET_BOT');
  const [botDeepLink, setBotDeepLink] = useState<string>('');
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Password Reset states
  const [resetToken, setResetToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);

  // Centralized Auth hook & Telegram registration fields
  const auth = useAuth();
  const [tgUsername, setTgUsername] = useState<string>('');
  const [tgReferralCode, setTgReferralCode] = useState<string>('');

  // Synchronize internal mode whenever modal is opened or requested mode changes
  const isInsideTg =
    telegramSdk.isInsideTelegram() ||
    Boolean(telegramSdk.getInitData()) ||
    Boolean(auth.tempToken) ||
    Boolean(auth.telegramUser) ||
    auth.status === 'NEW_USER' ||
    auth.status === 'REGISTRATION_REQUIRED';

  React.useEffect(() => {
    if (isOpen) {
      telegramSdk.logDiagnostics();
      console.log('[AuthModal] Opened. isInsideTg:', isInsideTg, 'initialMode:', initialMode, 'authStatus:', auth.status);
      if (isInsideTg && (initialMode === 'register' || initialMode === 'tg_register' || initialMode === 'teaser')) {
        setMode('tg_register');
        if (auth.status === 'UNINITIALIZED' || auth.status === 'UNAUTHENTICATED') {
          auth.initAuth();
        }
      } else {
        setMode(initialMode);
      }
      setErrorMessage(null);
      setDeniedReason(null);
      setIsLoading(false);
      if (auth.suggestedUsername) setTgUsername(auth.suggestedUsername);
      if (auth.referralCode) setTgReferralCode(auth.referralCode);
    }
  }, [isOpen, initialMode, auth.suggestedUsername, auth.referralCode, isInsideTg]);

  // Guard: if inside Telegram, ensure mode is tg_register rather than register
  React.useEffect(() => {
    if (isOpen && isInsideTg && (mode === 'register' || mode === 'teaser')) {
      setMode('tg_register');
    }
  }, [isOpen, isInsideTg, mode]);

  React.useEffect(() => {
    if (isOpen && isInsideTg && !auth.tempToken && auth.status !== 'AUTHENTICATED' && auth.status !== 'AUTHENTICATING') {
      console.log('[AuthModal] Triggering initAuth in tg_register mode');
      auth.initAuth();
    }
  }, [isOpen, isInsideTg, auth.tempToken, auth.status]);

  React.useEffect(() => {
    if (auth.suggestedUsername && !tgUsername) {
      setTgUsername(auth.suggestedUsername);
    }
  }, [auth.suggestedUsername]);

  React.useEffect(() => {
    if (auth.referralCode && !tgReferralCode) {
      setTgReferralCode(auth.referralCode);
    }
  }, [auth.referralCode]);

  // Real-time socket listener for registration verification & denial
  React.useEffect(() => {
    if (!socket || !isOpen) return;

    const targetPhone = pendingPhone || phone;
    if (targetPhone && mode === 'verify') {
      socket.emit('SUBSCRIBE_REGISTRATION', { phone: targetPhone });
    }
    if (targetPhone && mode === 'reset_verify') {
      socket.emit('SUBSCRIBE_PASSWORD_RESET', { phone: targetPhone });
    }

    const handleRegSuccess = (data: { phone: string; user: UserAccount; token?: string }) => {
      if (mode !== 'verify') return;
      const target = pendingPhone || phone;
      if (!target || data.phone.endsWith(target.slice(-8))) {
        if (data.token) localStorage.setItem('bingo_auth_token', data.token);
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        onSuccess(data.user, data.token || '');
        setDeniedReason(null);
        setMode('welcome');
      }
    };

    const handleRegDenied = (data: { expectedPhone: string; sharedPhone: string; reason?: string }) => {
      if (mode !== 'verify') return;
      const target = pendingPhone || phone;
      if (!target || data.expectedPhone.endsWith(target.slice(-8))) {
        setDeniedReason(
          `Verification Denied: Sign-up phone (${data.expectedPhone}) does not match the phone shared in Telegram (${data.sharedPhone}). Account creation was denied.`
        );
        soundService.playClick();
        telegramSdk.triggerHaptic('error');
      }
    };

    const handleResetAuthorized = (data: { phone: string; resetToken: string }) => {
      const target = pendingPhone || phone;
      if (!target || data.phone.endsWith(target.slice(-8))) {
        setResetToken(data.resetToken);
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        setDeniedReason(null);
        setMode('new_password');
      }
    };

    const handleResetDenied = (data: { expectedPhone: string; sharedPhone: string; reason?: string }) => {
      const target = pendingPhone || phone;
      if (!target || data.expectedPhone.endsWith(target.slice(-8))) {
        setDeniedReason(
          `Reset Denied: Registered phone (${data.expectedPhone}) does not match the phone shared in Telegram (${data.sharedPhone}). Password reset was denied.`
        );
        soundService.playClick();
        telegramSdk.triggerHaptic('error');
      }
    };

    socket.on('REGISTRATION_SUCCESS', handleRegSuccess);
    socket.on('PHONE_VERIFIED', handleRegSuccess);
    socket.on('REGISTRATION_DENIED', handleRegDenied);
    socket.on('PASSWORD_RESET_AUTHORIZED', handleResetAuthorized);
    socket.on('PASSWORD_RESET_DENIED', handleResetDenied);

    return () => {
      if (targetPhone) {
        socket.emit('UNSUBSCRIBE_REGISTRATION', { phone: targetPhone });
        socket.emit('UNSUBSCRIBE_PASSWORD_RESET', { phone: targetPhone });
      }
      socket.off('REGISTRATION_SUCCESS', handleRegSuccess);
      socket.off('PHONE_VERIFIED', handleRegSuccess);
      socket.off('REGISTRATION_DENIED', handleRegDenied);
      socket.off('PASSWORD_RESET_AUTHORIZED', handleResetAuthorized);
      socket.off('PASSWORD_RESET_DENIED', handleResetDenied);
    };
  }, [socket, isOpen, mode, pendingPhone, phone, onSuccess]);

  // Auto-poll registration status when waiting on Step 2 (Register)
  React.useEffect(() => {
    if (!isOpen || mode !== 'verify' || !pendingPhone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/auth/registration-status/${pendingPhone}`));
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'verified' && data.user) {
            if (data.token) localStorage.setItem('bingo_auth_token', data.token);
            soundService.playJackpotFanfare();
            telegramSdk.triggerHaptic('success');
            onSuccess(data.user, data.token || '');
            setDeniedReason(null);
            setMode('welcome');
          } else if (data.status === 'denied') {
            setDeniedReason(data.error || 'Phone mismatch: Account creation was denied.');
          }
        }
      } catch (e) {
        // quiet polling error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, mode, pendingPhone, onSuccess]);

  // Auto-poll password reset status when waiting on Step 2 (Forgot Password)
  React.useEffect(() => {
    if (!isOpen || mode !== 'reset_verify' || !pendingPhone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/auth/forgot-password-status/${pendingPhone}`));
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'authorized' && data.resetToken) {
            setResetToken(data.resetToken);
            soundService.playLineChime();
            telegramSdk.triggerHaptic('success');
            setDeniedReason(null);
            setMode('new_password');
          } else if (data.status === 'denied') {
            setDeniedReason(data.error || 'Phone mismatch: Password reset was denied.');
          }
        }
      } catch (e) {
        // quiet polling error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, mode, pendingPhone]);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d+]/g, '');
    if (val.length > 13) val = val.substring(0, 13);
    setPhone(val);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setDeniedReason(null);

    if (!name.trim()) {
      setErrorMessage('Please enter your full name');
      return;
    }
    if (!phone.trim() || phone.length < 9) {
      setErrorMessage('Please enter a valid Ethiopian phone number (e.g. 0912345678)');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl('/api/auth/register-initiate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          password
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Registration request failed');
        setIsLoading(false);
        return;
      }

      setPendingPhone(data.phone || phone.trim());
      if (data.botUsername) setBotUsername(data.botUsername);
      if (data.botUrl) setBotDeepLink(data.botUrl);
      setDeniedReason(null);
      setMode('verify');
      soundService.playClick();
      telegramSdk.triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestPlay = async () => {
    setIsLoading(true);
    soundService.playClick();
    try {
      const guestId = `usr_${Date.now().toString(36)}`;
      const guestName = `Player_${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await fetch(apiUrl('/api/user/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: guestId,
          username: guestName
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        soundService.playJackpotFanfare();
        onSuccess(data.user, '');
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Guest play error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCheck = async () => {
    const checkTargetPhone = pendingPhone || phone;
    if (!checkTargetPhone) {
      setErrorMessage('No phone number pending verification');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl(`/api/auth/registration-status/${checkTargetPhone}`));
      const data = await res.json();

      if (data.status === 'verified' && data.user) {
        if (data.token) {
          localStorage.setItem('bingo_auth_token', data.token);
        }
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        onSuccess(data.user, data.token || '');
        setDeniedReason(null);
        setMode('welcome');
      } else if (data.status === 'denied') {
        setDeniedReason(data.error || 'Verification Denied: Phone number mismatch.');
        soundService.playClick();
        telegramSdk.triggerHaptic('error');
      } else {
        setErrorMessage('Verification is still pending in Telegram. Please open the bot and tap "Share My Phone Number".');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification check failed');
    } finally {
      setIsLoading(false);
    }
  };


  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!phone.trim()) {
      setErrorMessage('Please enter your phone number');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Invalid phone number or password');
        setIsLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem('bingo_auth_token', data.token);
      }

      soundService.playLineChime();
      telegramSdk.triggerHaptic('success');
      onSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegram1Tap = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      await auth.initAuth();
      if (auth.status === 'AUTHENTICATED' && auth.user) {
        if (auth.sessionToken) localStorage.setItem('bingo_auth_token', auth.sessionToken);
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        onSuccess(auth.user, auth.sessionToken || '');
        onClose();
      } else if (auth.status === 'NEW_USER' || auth.status === 'REGISTRATION_REQUIRED') {
        setMode('tg_register');
      } else if (auth.error) {
        setErrorMessage(auth.error);
      } else {
        setErrorMessage('Telegram authentication is available when running inside Telegram Mini App. Or sign in with phone below.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Telegram auth error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTgRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const chosen = tgUsername.trim();
    if (!chosen || chosen.length < 3 || chosen.length > 20) {
      setErrorMessage('Username must be between 3 and 20 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(chosen)) {
      setErrorMessage('Username can only contain letters, numbers, and underscores');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const result = await auth.completeRegistration(chosen, tgReferralCode.trim());
      if (!result.success) {
        setErrorMessage(result.error || 'Registration failed. Please choose another username.');
        telegramSdk.triggerHaptic('error');
      } else {
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        if (auth.user) {
          onSuccess(auth.user, auth.sessionToken || '');
        }
        setMode('welcome');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error during registration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setDeniedReason(null);

    const resetPhone = pendingPhone || phone;
    if (!resetPhone.trim() || resetPhone.length < 9) {
      setErrorMessage('Please enter your registered Ethiopian phone number (e.g. 0912345678)');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password-initiate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: resetPhone.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to initiate password reset');
        setIsLoading(false);
        return;
      }

      setPendingPhone(data.phone || resetPhone.trim());
      if (data.botUsername) setBotUsername(data.botUsername);
      if (data.botUrl) setBotDeepLink(data.botUrl);
      setDeniedReason(null);
      setMode('reset_verify');
      soundService.playClick();
      telegramSdk.triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetStatusCheck = async () => {
    const checkTargetPhone = pendingPhone || phone;
    if (!checkTargetPhone) {
      setErrorMessage('No phone number pending reset verification');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl(`/api/auth/forgot-password-status/${checkTargetPhone}`));
      const data = await res.json();

      if (data.status === 'authorized' && data.resetToken) {
        setResetToken(data.resetToken);
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        setDeniedReason(null);
        setMode('new_password');
      } else if (data.status === 'denied') {
        setDeniedReason(data.error || 'Password reset denied: Phone number mismatch.');
        soundService.playClick();
        telegramSdk.triggerHaptic('error');
      } else {
        setErrorMessage('Verification pending in Telegram. Open the bot and tap "Share My Phone Number".');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Status check failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    if (!resetToken) {
      setErrorMessage('Reset session expired. Please restart the forgot password process.');
      setMode('forgot_password');
      return;
    }

    setIsLoading(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password-complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: pendingPhone || phone,
          resetToken,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to update password');
        setIsLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem('bingo_auth_token', data.token);
      }

      soundService.playJackpotFanfare();
      telegramSdk.triggerHaptic('success');
      onSuccess(data.user, data.token || '');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to set new password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md text-white overflow-y-auto animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-md my-auto rounded-3xl bg-[#111111] border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#E8FF00]/10 via-transparent to-transparent pointer-events-none" />

        {/* Header */}
        <header className="relative z-20 w-full px-4 py-3 bg-[#161616]/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundService.playClick();
                if (mode === 'forgot_password' || mode === 'reset_verify' || mode === 'new_password') {
                  setMode('login');
                  setErrorMessage(null);
                  setDeniedReason(null);
                } else if (mode === 'verify') {
                  setMode(isInsideTg ? 'tg_register' : 'register');
                  setErrorMessage(null);
                  setDeniedReason(null);
                } else if (mode === 'tg_register') {
                  onClose();
                  setErrorMessage(null);
                } else {
                  onClose();
                }
              }}
              className="w-8 h-8 rounded-xl bg-[#202020] hover:bg-[#282828] text-white/80 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="font-arcade font-black text-base text-white uppercase tracking-wider">
                BINGO BET
              </span>
              <span className="text-[9px] font-arcade font-black px-2 py-0.5 rounded-full bg-[#E8FF00] text-black uppercase">
                WEB
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#282828] text-white/60 hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 font-arcade">
          {/* Global Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span className="flex-1 font-bold">{errorMessage}</span>
            </div>
          )}

          {/* TELEGRAM REGISTRATION MODE: Complete Telegram Profile */}
          {mode === 'tg_register' && (
            (auth.isLoading || auth.status === 'AUTHENTICATING') ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#E8FF00]" />
                <p className="text-xs font-bold text-white uppercase tracking-wider">Verifying Telegram Identity...</p>
                <p className="text-[11px] text-white/50">Securing your account with Telegram initData</p>
              </div>
            ) : (
            <form onSubmit={handleTgRegisterSubmit} className="space-y-4 py-1 animate-fadeIn">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  TELEGRAM IDENTITY VERIFIED
                </h3>
                <p className="text-[11px] text-white/60">
                  {auth.telegramUser?.username ? (
                    <>Connected as <span className="text-[#0088cc] font-bold">@{auth.telegramUser.username}</span></>
                  ) : (
                    <>Connected as <span className="text-[#0088cc] font-bold">{auth.telegramUser?.first_name || 'Telegram User'}</span></>
                  )}
                </p>
              </div>

              {/* Username Input */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/70 uppercase">
                    CHOOSE BINGO USERNAME
                  </label>
                  <span className="text-[9px] text-white/40 font-mono">3-20 chars</span>
                </div>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={tgUsername}
                    onChange={(e) => setTgUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="e.g. LuckyWinner"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-[#161616] border border-white/15 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
                <div className="text-[9px] text-white/40">
                  Letters, numbers, and underscores only. This will be your in-game name.
                </div>
              </div>

              {/* Referral Code (Optional) */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/70 uppercase">
                    REFERRAL CODE (OPTIONAL)
                  </label>
                  <span className="text-[9px] text-[#E8FF00] font-mono font-bold">+ BONUS BIRR</span>
                </div>
                <div className="relative">
                  <Crown className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={16}
                    value={tgReferralCode}
                    onChange={(e) => setTgReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="e.g. BINGO-ABCD12"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-[#161616] border border-white/15 text-white text-xs font-mono uppercase placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
                <div className="text-[9px] text-white/40">
                  Enter a friend's referral code to receive an extra starting bonus.
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !tgUsername.trim()}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(232,255,0,0.3)]"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>CREATING ACCOUNT...</span>
                  </>
                ) : (
                  <>
                    <span>COMPLETE & PLAY NOW</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
            )
          )}

          {/* 1. TEASER MODE */}
          {mode === 'teaser' && (
            <div className="space-y-4 py-2 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00]">
                <Crown className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-base font-black text-white uppercase">JOIN BINGO BET</h3>
                <p className="text-xs text-white/60 mt-1">
                  Ethiopia's #1 Live 75-Ball Pari-Mutuel Game
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#161616] border border-white/10 text-left flex items-start gap-2.5">
                <Send className="w-4 h-4 text-[#E8FF00] flex-shrink-0 mt-0.5" />
                <div className="text-xs text-white/70">
                  <strong className="text-white block font-black mb-0.5">Instant Phone Sign-up</strong>
                  We confirm your number on Telegram in seconds with zero password hassle.
                </div>
              </div>

              <button
                onClick={() => {
                  soundService.playClick();
                  setMode(isInsideTg ? 'tg_register' : 'register');
                }}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>CREATE FREE ACCOUNT</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-2 text-center text-xs text-white/60">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    soundService.playClick();
                    setMode('login');
                  }}
                  className="text-[#E8FF00] font-black hover:underline cursor-pointer"
                >
                  Log In
                </button>
              </div>
            </div>
          )}

          {/* 2. REGISTER MODE (Fallback for users outside Telegram) */}
          {mode === 'register' && !isInsideTg && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <h2 className="text-sm font-black text-white uppercase">Create Account</h2>
                <p className="text-[10px] text-white/60 mt-0.5">
                  Sign up with your phone number and get an instant 1,000 Birr bonus.
                </p>
              </div>

              {/* Guest Instant Play */}
              <button
                type="button"
                onClick={handleGuestPlay}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl text-xs font-arcade font-bold bg-[#1a1a1a] hover:bg-[#242424] border border-white/10 text-white flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>⚡ PLAY AS GUEST (INSTANT)</span>
              </button>

              <div className="flex items-center gap-2 my-1 text-[10px] text-white/40 font-bold">
                <div className="flex-1 h-px bg-white/10" />
                <span>OR SIGN UP WITH PHONE</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Name */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-white/70 uppercase">NAME</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-white/70 uppercase">PHONE NUMBER</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="0912345678"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-white/70 uppercase">PASSWORD</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-white/70 uppercase">CONFIRM PASSWORD</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-neon w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'CREATING...' : 'CONTINUE'}
              </button>

              <div className="pt-2 text-center text-xs text-white/60 border-t border-white/10">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    soundService.playClick();
                    setErrorMessage(null);
                    setMode('login');
                  }}
                  className="text-[#E8FF00] font-black hover:underline cursor-pointer"
                >
                  Login
                </button>
              </div>
            </form>
          )}

          {/* 3. VERIFY PHONE MODE (Strict Telegram Phone Matching) */}
          {mode === 'verify' && (
            <div className="space-y-3.5 py-1 text-center">
              {/* Status Header */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-[#0088cc]/20 border border-[#0088cc]/40 flex items-center justify-center text-[#0088cc] shadow-[0_0_20px_rgba(0,136,204,0.3)] mb-2">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  TELEGRAM PHONE VERIFICATION
                </h3>
                <p className="text-[11px] text-white/70 mt-0.5 max-w-xs">
                  Share your phone number in <span className="text-[#0088cc] font-bold">@{botUsername}</span> to confirm ownership and create your account.
                </p>
              </div>

              {/* Sign-up Request Phone Info Card */}
              <div className="p-3 rounded-2xl bg-[#161616] border border-white/10 text-left space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/50">
                    SIGN-UP REQUEST NUMBER
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-[#E8FF00]/15 text-[#E8FF00] border border-[#E8FF00]/30 animate-pulse uppercase">
                    AWAITING SHARE
                  </span>
                </div>
                <div className="font-mono text-base font-black text-[#E8FF00] tracking-wider">
                  {pendingPhone || phone}
                </div>
                <div className="text-[10px] text-white/60 leading-tight">
                  The phone number you share via Telegram must match this number. Otherwise, account creation will be denied.
                </div>
              </div>

              {/* DENIED STATE ALERT (If Phone Numbers Mismatched) */}
              {deniedReason ? (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-left space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-rose-300 uppercase tracking-wide">
                        ACCOUNT CREATION DENIED
                      </h4>
                      <p className="text-[11px] text-rose-200/90 font-medium mt-1 leading-snug">
                        {deniedReason}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundService.playClick();
                        setDeniedReason(null);
                        setMode(isInsideTg ? 'tg_register' : 'register');
                      }}
                      className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>EDIT PHONE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundService.playClick();
                        setDeniedReason(null);
                        const botUrl = botDeepLink || `https://t.me/${botUsername}?start=reg_${pendingPhone || phone}`;
                        telegramSdk.openTelegramLink(botUrl);
                      }}
                      className="py-2 px-3 rounded-xl bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>RETRY BOT</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Step Instructions */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-arcade">
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-[#0088cc]/20 text-[#0088cc] font-black flex items-center justify-center text-[10px]">
                        1
                      </div>
                      <div className="text-white font-bold">Open Bot</div>
                      <div className="text-white/40 text-[8px]">Tap Open below</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-[#E8FF00]/20 text-[#E8FF00] font-black flex items-center justify-center text-[10px]">
                        2
                      </div>
                      <div className="text-white font-bold">Press Start</div>
                      <div className="text-white/40 text-[8px]">In Telegram</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-[10px]">
                        3
                      </div>
                      <div className="text-white font-bold">Share Contact</div>
                      <div className="text-white/40 text-[8px]">Tap button</div>
                    </div>
                  </div>

                  {/* Primary CTA: Open Telegram Bot */}
                  <button
                    type="button"
                    onClick={() => {
                      soundService.playClick();
                      telegramSdk.triggerHaptic('medium');
                      const botUrl = botDeepLink || `https://t.me/${botUsername}?start=reg_${pendingPhone || phone}`;
                      telegramSdk.openTelegramLink(botUrl);
                    }}
                    className="btn-neon w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(232,255,0,0.3)]"
                  >
                    <Send className="w-4 h-4" />
                    <span>OPEN @{botUsername} TO SHARE PHONE</span>
                  </button>

                  {/* Live Auto-listening Banner */}
                  <div className="p-2.5 rounded-xl bg-[#141414] border border-[#E8FF00]/20 flex items-center justify-center gap-2 text-[10px] text-[#E8FF00]">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#E8FF00]" />
                    <span className="font-black uppercase tracking-wider">
                      AUTO-LISTENING FOR TELEGRAM SHARE...
                    </span>
                  </div>

                  {/* Check Status Button */}
                  <button
                    type="button"
                    onClick={handleVerifyCheck}
                    disabled={isLoading}
                    className="w-full py-2 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] text-white/80 hover:text-white font-black text-[10px] uppercase tracking-wider border border-white/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-[#E8FF00]" />
                    <span>CHECK STATUS NOW</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* 4. WELCOME BONUS */}
          {mode === 'welcome' && (
            <div className="space-y-4 py-2 text-center animate-fadeIn">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00] animate-bounce">
                <Sparkles className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-base font-black text-white uppercase">WELCOME TO BINGO BET!</h3>
                <p className="text-xs text-white/70 mt-1">
                  Your account is verified and ready to play.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#161616] border border-[#E8FF00]/30 text-left flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-black text-white/50 block">WELCOME BONUS</span>
                  <span className="text-xl font-black font-mono text-[#E8FF00]">+1,000 Birr</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#E8FF00] text-black text-xs font-black">
                  READY
                </span>
              </div>

              <button
                onClick={() => {
                  soundService.playClick();
                  onClose();
                }}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>START PLAYING NOW</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 5. LOGIN MODE */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <h2 className="text-sm font-black text-white uppercase">Welcome Back</h2>
                <p className="text-[10px] text-white/60 mt-0.5">
                  Log in with phone number and password.
                </p>
              </div>

              {/* Quick Telegram 1-Tap */}
              <button
                type="button"
                onClick={handleTelegram1Tap}
                disabled={isLoading}
                className="btn-neon w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>QUICK LOGIN VIA TELEGRAM</span>
              </button>

              <div className="flex items-center gap-2 my-1 text-[10px] text-white/40 font-bold">
                <div className="flex-1 h-px bg-white/10" />
                <span>OR PASSWORD</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Phone */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-white/70 uppercase">PHONE NUMBER</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="0912345678"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/70 uppercase">PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => {
                      soundService.playClick();
                      setErrorMessage(null);
                      setDeniedReason(null);
                      setPendingPhone(phone || '');
                      setMode('forgot_password');
                    }}
                    className="text-[10px] text-[#E8FF00] font-black hover:underline cursor-pointer uppercase"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-neon w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'LOGGING IN...' : 'LOGIN'}
              </button>

              {/* Guest Play */}
              <button
                type="button"
                onClick={handleGuestPlay}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl text-xs font-arcade font-bold bg-[#1a1a1a] hover:bg-[#242424] border border-white/10 text-white flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>⚡ PLAY AS GUEST (INSTANT)</span>
              </button>

              <div className="pt-2 text-center text-xs text-white/60 border-t border-white/10">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    soundService.playClick();
                    setErrorMessage(null);
                    setMode(isInsideTg ? 'tg_register' : 'register');
                  }}
                  className="text-[#E8FF00] font-black hover:underline cursor-pointer"
                >
                  Register
                </button>
              </div>
            </form>
          )}

          {/* 6. FORGOT PASSWORD MODE */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 text-left animate-fadeIn">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#E8FF00]/15 border border-[#E8FF00]/30 flex items-center justify-center text-[#E8FF00]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase">RESET PASSWORD</h2>
                    <p className="text-[10px] text-white/60">
                      Verify your account via Telegram bot to reset password.
                    </p>
                  </div>
                </div>
              </div>

              {/* Ethiopian Phone Number */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/70 uppercase">
                  REGISTERED ETHIOPIAN PHONE
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={pendingPhone || phone}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^\d+]/g, '');
                      if (val.length > 13) val = val.substring(0, 13);
                      setPhone(val);
                      setPendingPhone(val);
                    }}
                    placeholder="0912345678"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-[#161616] border border-white/15 text-white text-xs font-mono placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
                <p className="text-[9px] text-white/40">
                  Must be the exact phone number linked to your Telegram account.
                </p>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(232,255,0,0.25)] disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isLoading ? 'INITIATING...' : 'CONTINUE TO TELEGRAM BOT'}</span>
              </button>

              <div className="pt-2 text-center text-xs text-white/60 border-t border-white/10">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    soundService.playClick();
                    setErrorMessage(null);
                    setMode('login');
                  }}
                  className="text-[#E8FF00] font-black hover:underline cursor-pointer"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {/* 7. RESET VERIFY MODE (Confirm Identity in Telegram Bot) */}
          {mode === 'reset_verify' && (
            <div className="space-y-4 py-1 text-center animate-fadeIn font-arcade">
              {/* Header Icon */}
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0088cc]/15 border border-[#0088cc]/30 flex items-center justify-center text-[#0088cc] shadow-[0_0_25px_rgba(0,136,204,0.3)]">
                <ShieldCheck className="w-7 h-7" />
              </div>

              <div>
                <span className="text-[9px] font-black text-[#E8FF00] tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-[#E8FF00]/10 border border-[#E8FF00]/20">
                  STEP 2 OF 3: TELEGRAM IDENTITY CONFIRMATION
                </span>
                <h3 className="text-sm font-black text-white uppercase mt-2">
                  VERIFY PHONE OWNERSHIP
                </h3>
                <p className="text-[11px] text-white/70 mt-0.5 font-sans">
                  Target Account Phone:{' '}
                  <span className="font-mono font-bold text-[#E8FF00]">{pendingPhone || phone}</span>
                </p>
              </div>

              {/* DENIED STATE ALERT (If Phone Numbers Mismatched) */}
              {deniedReason ? (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-left space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-rose-300 uppercase tracking-wide">
                        PASSWORD RESET DENIED
                      </h4>
                      <p className="text-[11px] text-rose-200/90 font-medium mt-1 leading-snug">
                        {deniedReason}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundService.playClick();
                        setDeniedReason(null);
                        setMode('forgot_password');
                      }}
                      className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>CHANGE PHONE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundService.playClick();
                        setDeniedReason(null);
                        const botUrl = botDeepLink || `https://t.me/${botUsername}?start=reset_${pendingPhone || phone}`;
                        telegramSdk.openTelegramLink(botUrl);
                      }}
                      className="py-2 px-3 rounded-xl bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>RETRY BOT</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Step Instructions */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-arcade">
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-[#0088cc]/20 text-[#0088cc] font-black flex items-center justify-center text-[10px]">
                        1
                      </div>
                      <div className="text-white font-bold">Open Bot</div>
                      <div className="text-white/40 text-[8px]">Tap button below</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-[#E8FF00]/20 text-[#E8FF00] font-black flex items-center justify-center text-[10px]">
                        2
                      </div>
                      <div className="text-white font-bold">Press Start</div>
                      <div className="text-white/40 text-[8px]">In Telegram</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#161616] border border-white/5 space-y-1">
                      <div className="w-5 h-5 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-[10px]">
                        3
                      </div>
                      <div className="text-white font-bold">Share Contact</div>
                      <div className="text-white/40 text-[8px]">One-tap verify</div>
                    </div>
                  </div>

                  {/* Primary CTA: Open Telegram Bot */}
                  <button
                    type="button"
                    onClick={() => {
                      soundService.playClick();
                      telegramSdk.triggerHaptic('medium');
                      const botUrl = botDeepLink || `https://t.me/${botUsername}?start=reset_${pendingPhone || phone}`;
                      telegramSdk.openTelegramLink(botUrl);
                    }}
                    className="btn-neon w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(232,255,0,0.3)]"
                  >
                    <Send className="w-4 h-4" />
                    <span>OPEN @{botUsername} TO CONFIRM IDENTITY</span>
                  </button>

                  {/* Live Auto-listening Banner */}
                  <div className="p-2.5 rounded-xl bg-[#141414] border border-[#E8FF00]/20 flex items-center justify-center gap-2 text-[10px] text-[#E8FF00]">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#E8FF00]" />
                    <span className="font-black uppercase tracking-wider">
                      WAITING FOR TELEGRAM CONTACT CONFIRMATION...
                    </span>
                  </div>

                  {/* Check Status Button */}
                  <button
                    type="button"
                    onClick={handleResetStatusCheck}
                    disabled={isLoading}
                    className="w-full py-2 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] text-white/80 hover:text-white font-black text-[10px] uppercase tracking-wider border border-white/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-[#E8FF00]" />
                    <span>CHECK RESET STATUS NOW</span>
                  </button>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundService.playClick();
                        setMode('forgot_password');
                      }}
                      className="text-[10px] text-white/50 hover:text-white underline cursor-pointer"
                    >
                      ← Back to Phone Entry
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 8. NEW PASSWORD MODE */}
          {mode === 'new_password' && (
            <form onSubmit={handleNewPasswordSubmit} className="space-y-4 text-left animate-fadeIn">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-sm font-black text-white uppercase">CREATE NEW PASSWORD</h2>
                <p className="text-[10px] text-white/60">
                  Identity verified for <span className="text-[#E8FF00] font-mono font-bold">{pendingPhone || phone}</span>.
                </p>
              </div>

              {/* New Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/70 uppercase">NEW PASSWORD</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-8 pr-8 py-2.5 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/70 uppercase">CONFIRM NEW PASSWORD</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full pl-8 pr-8 py-2.5 rounded-xl bg-[#161616] border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-[#E8FF00]"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-neon w-full py-3 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(232,255,0,0.25)] disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isLoading ? 'UPDATING...' : 'UPDATE PASSWORD & LOG IN'}</span>
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};
