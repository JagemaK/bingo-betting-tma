import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { app, isOriginAllowed } from './index.js';

describe('CORS and Origin Validation Suite', () => {
  let server: Server;
  let testPort: number;

  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          testPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('allows Cloudflare frontend tunnel origin', () => {
    expect(isOriginAllowed('https://regions-burns-mile-dim.trycloudflare.com')).toBe(true);
  });

  it('allows localhost and 127.0.0.1 on ports 5173 and 3001', () => {
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:3001')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3001')).toBe(true);
  });

  it('dynamically allows any *.trycloudflare.com domain', () => {
    expect(isOriginAllowed('https://random-subdomain-1234.trycloudflare.com')).toBe(true);
  });

  it('allows requests without origin (curl, server-to-server, mobile app)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('rejects untrusted external origins', () => {
    expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
    expect(isOriginAllowed('https://attacker.org')).toBe(false);
  });

  it('Express responds with proper Access-Control-Allow-Origin and Credentials for Cloudflare origin', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://regions-burns-mile-dim.trycloudflare.com',
        'Access-Control-Request-Method': 'GET'
      }
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('https://regions-burns-mile-dim.trycloudflare.com');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('Express responds with proper CORS headers for localhost:5173', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET'
      }
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('Telegram registration endpoint is accessible through API and responds with bot details', async () => {
    const testPhone = '0988776655';
    const res = await fetch(`http://localhost:${testPort}/api/auth/register-initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://regions-burns-mile-dim.trycloudflare.com'
      },
      body: JSON.stringify({
        name: 'Cloudflare Test User',
        phone: testPhone,
        password: 'password123'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.phone).toBe(testPhone);
    expect(data.botUrl).toContain('t.me');
  });
});
