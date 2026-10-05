import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserAccount } from '../types/bingo.js';
import { telegramSdk } from './telegramSdk.js';
import { apiUrl } from '../config/api.js';

export type AuthStateStatus =
  | 'UNINITIALIZED'
  | 'TELEGRAM_DETECTED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'NEW_USER'
  | 'REGISTRATION_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'AUTH_ERROR';

export interface TelegramUserBrief {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface AuthContextType {
  status: AuthStateStatus;
  user: UserAccount | null;
  sessionToken: string | null;
  tempToken: string | null;
  telegramUser: TelegramUserBrief | null;
  suggestedUsername: string;
  referralCode: string;
  error: string | null;
  isLoading: boolean;
  initAuth: (overrideInitData?: string) => Promise<void>;
  completeRegistration: (username: string, refCode?: string) => Promise<{ success: boolean; user?: UserAccount; sessionToken?: string; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (u: UserAccount) => void;
  setGuestUser: (guest: UserAccount) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStateStatus>('UNINITIALIZED');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUserBrief | null>(null);
  const [suggestedUsername, setSuggestedUsername] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearError = useCallback(() => setError(null), []);

  const updateUser = useCallback((updated: UserAccount) => {
    setUser(updated);
  }, []);

  const setGuestUser = useCallback((guest: UserAccount) => {
    setUser(guest);
    setStatus('AUTHENTICATED');
  }, []);

  const initAuth = useCallback(async (overrideInitData?: string) => {
    setIsLoading(true);
    setError(null);

    // 1. Extract Telegram initData as the PRIMARY authoritative source of truth
    const initData = overrideInitData || telegramSdk.getInitData();
    const startParam = telegramSdk.getStartParam() || '';
    if (startParam) {
      setReferralCode(startParam);
    }

    telegramSdk.logDiagnostics();
    console.log('[AuthContext] initAuth. Has initData:', Boolean(initData), 'length:', initData?.length || 0);

    if (initData) {
      setStatus('AUTHENTICATING');
      try {
        const res = await fetch(apiUrl('/api/auth/telegram'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, referralCode: startParam })
        });

        const data = await res.json();
        console.log('[AuthContext] /api/auth/telegram response:', {
          status: data?.status,
          success: data?.success,
          hasUser: Boolean(data?.user),
          hasTempToken: Boolean(data?.tempToken)
        });

        if (!res.ok || !data.success) {
          setError(data.error || 'Telegram authentication failed');
          setStatus('AUTH_ERROR');
          setIsLoading(false);
          return;
        }

        if (data.status === 'AUTHENTICATED' && data.user && data.sessionToken) {
          localStorage.setItem('bingo_auth_token', data.sessionToken);
          setSessionToken(data.sessionToken);
          setUser(data.user);
          setStatus('AUTHENTICATED');
        } else if (data.status === 'NEW_USER' || data.status === 'REGISTRATION_REQUIRED') {
          // New Telegram account detected - purge any stale session token from previous user
          localStorage.removeItem('bingo_auth_token');
          setSessionToken(null);
          setUser(null);
          setTempToken(data.tempToken || null);
          setTelegramUser(data.telegramUser || null);
          setSuggestedUsername(data.suggestedUsername || data.telegramUser?.username || '');
          if (data.referralCode) setReferralCode(data.referralCode);
          setStatus(data.status);
        } else {
          setStatus('UNAUTHENTICATED');
        }
      } catch (err: any) {
        setError(err.message || 'Network error during Telegram authentication');
        setStatus('AUTH_ERROR');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 2. Standalone browser fallback: Check existing session token only when outside Telegram
    const existingToken = localStorage.getItem('bingo_auth_token');
    if (existingToken) {
      try {
        const res = await fetch(apiUrl('/api/auth/session'), {
          headers: { Authorization: `Bearer ${existingToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.user) {
            setUser(data.user);
            setSessionToken(existingToken);
            setStatus('AUTHENTICATED');
            setIsLoading(false);
            return;
          }
        }
        localStorage.removeItem('bingo_auth_token');
      } catch (err) {
        console.warn('Session restoration check warning:', err);
      }
    }

    // Outside Telegram WebApp without session
    setStatus('UNAUTHENTICATED');
    setIsLoading(false);
  }, []);

  const completeRegistration = useCallback(
    async (chosenUsername: string, refCode?: string): Promise<{ success: boolean; user?: UserAccount; sessionToken?: string; error?: string }> => {
      if (!tempToken) {
        return { success: false, error: 'Registration session expired. Please reopen the Mini App.' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tempToken}`
          },
          body: JSON.stringify({
            username: chosenUsername.trim(),
            referralCode: (refCode || referralCode || '').trim()
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || 'Registration failed');
          setIsLoading(false);
          return { success: false, error: data.error || 'Registration failed' };
        }

        if (data.sessionToken) {
          localStorage.setItem('bingo_auth_token', data.sessionToken);
          setSessionToken(data.sessionToken);
        }
        setUser(data.user);
        setStatus('AUTHENTICATED');
        setTempToken(null);
        setIsLoading(false);
        return { success: true, user: data.user, sessionToken: data.sessionToken };
      } catch (err: any) {
        const msg = err.message || 'Network error during registration';
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }
    },
    [tempToken, referralCode]
  );

  const logout = useCallback(async () => {
    const token = sessionToken || localStorage.getItem('bingo_auth_token');
    if (token) {
      try {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
      localStorage.removeItem('bingo_auth_token');
      localStorage.removeItem('bingo_player_id');
      localStorage.removeItem('bingo_username');
    }
    setUser(null);
    setSessionToken(null);
    setTempToken(null);
    setStatus('UNAUTHENTICATED');
  }, [sessionToken]);

  useEffect(() => {
    initAuth();

    // In Telegram Web / mobile iframe, initData is sometimes populated asynchronously right after mount
    if (typeof window !== 'undefined' && window.Telegram && !telegramSdk.getInitData()) {
      const timer1 = setTimeout(() => {
        if (telegramSdk.getInitData()) {
          console.log('[AuthContext] Delayed initData detected, re-running initAuth');
          initAuth();
        }
      }, 300);
      const timer2 = setTimeout(() => {
        if (telegramSdk.getInitData()) {
          console.log('[AuthContext] Delayed initData detected (tick 2), re-running initAuth');
          initAuth();
        }
      }, 800);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [initAuth]);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        sessionToken,
        tempToken,
        telegramUser,
        suggestedUsername,
        referralCode,
        error,
        isLoading,
        initAuth,
        completeRegistration,
        logout,
        updateUser,
        setGuestUser,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
