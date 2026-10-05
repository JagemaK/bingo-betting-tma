// Telegram WebApp SDK Wrapper & Bridge

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        enableClosingConfirmation: () => void;
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        themeParams: Record<string, string>;
        platform?: string;
        version?: string;
        initData?: string;
        initDataUnsafe?: {
          query_id?: string;
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
          auth_date?: number;
          hash?: string;
          start_param?: string;
        };
        openTelegramLink: (url: string) => void;
        openLink: (url: string) => void;
      };
    };
  }
}

export class TelegramSdkService {
  private isTma: boolean = false;

  constructor() {
    this.init();
  }

  public init() {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#090d16');
        tg.setBackgroundColor('#090d16');
        tg.enableClosingConfirmation();
        this.isTma = true;
        this.logDiagnostics();
      } catch (e) {
        console.warn('Telegram SDK initialization note:', e);
      }
    }
  }

  public isInsideTelegram(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.Telegram?.WebApp?.initData || window.Telegram?.WebApp?.initDataUnsafe?.user) {
      return true;
    }
    if (Boolean(this.getInitData())) {
      return true;
    }
    if (window.Telegram?.WebApp?.platform && window.Telegram.WebApp.platform !== 'unknown') {
      return true;
    }
    const ua = navigator.userAgent || '';
    if (/Telegram/i.test(ua)) {
      return true;
    }
    return false;
  }

  public logDiagnostics() {
    if (typeof window === 'undefined') return;
    const tg = window.Telegram?.WebApp;
    console.log('[TelegramDiagnostics] State:', {
      hasTelegramObject: Boolean(window.Telegram),
      hasWebApp: Boolean(tg),
      platform: tg?.platform || 'none',
      hasInitData: Boolean(this.getInitData()),
      initDataLength: this.getInitData().length,
      telegramUserId: tg?.initDataUnsafe?.user?.id || 'none',
      telegramUsername: tg?.initDataUnsafe?.user?.username || 'none',
      isInsideTelegram: this.isInsideTelegram()
    });
  }

  public getInitData(): string {
    if (typeof window !== 'undefined') {
      if (window.Telegram?.WebApp?.initData) {
        return window.Telegram.WebApp.initData;
      }
      // Check query string for tgWebAppData
      if (window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const tgWebAppData = urlParams.get('tgWebAppData');
        if (tgWebAppData) return tgWebAppData;
      }
      // Check hash fragment for tgWebAppData or direct initData parameters
      if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        const tgWebAppData = hashParams.get('tgWebAppData');
        if (tgWebAppData) return tgWebAppData;

        // Telegram Web & Desktop sometimes pass query string directly in hash (e.g. #query_id=...&user=...&hash=...)
        if (hashParams.has('hash') && (hashParams.has('user') || hashParams.has('query_id') || hashParams.has('auth_date'))) {
          return hash;
        }
      }
      if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const u = window.Telegram.WebApp.initDataUnsafe.user;
        const authDate = window.Telegram.WebApp.initDataUnsafe.auth_date || Math.floor(Date.now() / 1000);
        const queryId = window.Telegram.WebApp.initDataUnsafe.query_id || '';
        return `user=${encodeURIComponent(JSON.stringify(u))}&auth_date=${authDate}${queryId ? `&query_id=${queryId}` : ''}`;
      }
    }
    return '';
  }

  public getStartParam(): string | null {
    if (typeof window !== 'undefined') {
      if (window.Telegram?.WebApp?.initDataUnsafe?.start_param) {
        return window.Telegram.WebApp.initDataUnsafe.start_param;
      }
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('startapp')) return urlParams.get('startapp');
      if (urlParams.get('start')) return urlParams.get('start');
      if (urlParams.get('ref')) return urlParams.get('ref');
    }
    return null;
  }

  public getUserProfile(): { id: string; username: string; avatarUrl?: string } | null {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
      return {
        id: `tg_${tgUser.id}`,
        username: tgUser.username || tgUser.first_name || 'TG_Player',
        avatarUrl: tgUser.photo_url
      };
    }
    return null;
  }

  public triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection') {
    if (typeof window === 'undefined') return;

    try {
      const tg = window.Telegram?.WebApp?.HapticFeedback;
      if (tg) {
        if (type === 'light' || type === 'medium' || type === 'heavy') {
          tg.impactOccurred(type);
        } else if (type === 'success' || type === 'warning' || type === 'error') {
          tg.notificationOccurred(type);
        } else if (type === 'selection') {
          tg.selectionChanged();
        }
      } else if (navigator.vibrate) {
        // Fallback for mobile browsers supporting vibration API
        if (type === 'light' || type === 'selection') navigator.vibrate(10);
        else if (type === 'medium') navigator.vibrate(25);
        else if (type === 'heavy' || type === 'success') navigator.vibrate([40, 30, 40]);
        else if (type === 'error') navigator.vibrate([50, 50, 50]);
      }
    } catch (e) {}
  }

  public openTelegramLink(url: string) {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openTelegramLink) {
      try {
        window.Telegram.WebApp.openTelegramLink(url);
        return;
      } catch (e) {
        console.warn('openTelegramLink error:', e);
      }
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }
}

export const telegramSdk = new TelegramSdkService();
