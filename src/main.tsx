import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AuthProvider } from './services/authContext.js';
import { apiUrl } from './config/api.js';
import './index.css';

// Developer manual testing helper in browser console
if (typeof window !== 'undefined') {
  (window as any).testVerify = async (phone: string = '0912345678') => {
    console.log(`%c[DevTest] Simulating Telegram contact match for: ${phone}`, 'color: #0088cc; font-weight: bold;');
    try {
      const res = await fetch(apiUrl('/api/telegram/simulate-contact-share'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      console.log('[DevTest] Result:', data);
      return data;
    } catch (e) {
      console.error('[DevTest] Error:', e);
    }
  };

  (window as any).testDeny = async (expectedPhone: string = '0912345678', sharedPhone: string = '0999887766') => {
    console.log(`%c[DevTest] Simulating Telegram contact mismatch (expected: ${expectedPhone}, shared: ${sharedPhone})`, 'color: #ff4444; font-weight: bold;');
    try {
      const res = await fetch(apiUrl('/api/telegram/simulate-contact-share'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedPhone, sharedPhone })
      });
      const data = await res.json();
      console.log('[DevTest] Result:', data);
      return data;
    } catch (e) {
      console.error('[DevTest] Error:', e);
    }
  };

  (window as any).testReset = async (phone: string = '0912345678') => {
    console.log(`%c[DevTest] Simulating Telegram contact match for Forgot Password: ${phone}`, 'color: #E8FF00; font-weight: bold;');
    try {
      const res = await fetch(apiUrl('/api/telegram/simulate-contact-share'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, isReset: true })
      });
      const data = await res.json();
      console.log('[DevTest] Result:', data);
      return data;
    } catch (e) {
      console.error('[DevTest] Error:', e);
    }
  };

  console.log(
    '%c🛠️ BINGO BET MANUAL TEST HELPERS:%c\n• testVerify("09...") -> Simulates Telegram contact match (Account verified & created)\n• testDeny("09...", "07...") -> Simulates phone mismatch (Account denied)\n• testReset("09...") -> Simulates Telegram identity match for Forgot Password',
    'color: #E8FF00; font-weight: bold; background: #181818; padding: 6px 10px; border-radius: 6px; font-size: 11px;',
    'color: #88ff88; font-size: 11px;'
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);


