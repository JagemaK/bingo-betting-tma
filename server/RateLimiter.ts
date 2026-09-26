/**
 * Sliding Window In-Memory Rate Limiter for Authentication Protection
 *
 * Prevents brute-force credential stuffing and password guessing.
 * Keyed by:
 * - Client IP address
 * - Normalized Phone / Account identifier
 */

interface RateLimitRecord {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  blockedUntil: number;
}

export class RateLimiter {
  private records: Map<string, RateLimitRecord> = new Map();
  private maxAttempts: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(
    maxAttempts: number = 5,
    windowMs: number = 5 * 60 * 1000, // 5 minutes
    blockDurationMs: number = 5 * 60 * 1000 // 5 minutes
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.blockDurationMs = blockDurationMs;

    // Periodic cleanup of stale entries every 10 minutes
    const interval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (interval.unref) interval.unref();
  }

  public isRateLimited(key: string): { limited: boolean; retryAfterSeconds?: number } {
    if (!key) return { limited: false };

    const record = this.records.get(key);
    if (!record) return { limited: false };

    const now = Date.now();

    // Check if currently blocked
    if (now < record.blockedUntil) {
      const remainingSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      return { limited: true, retryAfterSeconds: remainingSeconds };
    }

    // Check if window has expired
    if (now - record.firstAttemptAt > this.windowMs) {
      this.records.delete(key);
      return { limited: false };
    }

    if (record.attempts >= this.maxAttempts) {
      // Exceeded limit: block
      record.blockedUntil = now + this.blockDurationMs;
      return {
        limited: true,
        retryAfterSeconds: Math.ceil(this.blockDurationMs / 1000)
      };
    }

    return { limited: false };
  }

  public recordFailure(key: string): void {
    if (!key) return;
    const now = Date.now();
    const record = this.records.get(key);

    if (!record || now - record.firstAttemptAt > this.windowMs) {
      this.records.set(key, {
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        blockedUntil: 0
      });
      return;
    }

    record.attempts++;
    record.lastAttemptAt = now;
    if (record.attempts >= this.maxAttempts) {
      record.blockedUntil = now + this.blockDurationMs;
    }
  }

  public reset(key: string): void {
    if (key) {
      this.records.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.records.entries()) {
      if (now - v.lastAttemptAt > this.windowMs && now > v.blockedUntil) {
        this.records.delete(k);
      }
    }
  }
}

export const authRateLimiter = new RateLimiter(5, 5 * 60 * 1000, 5 * 60 * 1000);

export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options?: {
    keyGenerator?: (req: any) => string;
    errorMessage?: string;
  }
) {
  return (req: any, res: any, next: any) => {
    // In test environment, bypass rate limits unless explicitly opting in
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'] && process.env.ENABLE_RATE_LIMIT_TEST !== 'true') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const key = options?.keyGenerator
      ? options.keyGenerator(req)
      : `${req.path}:${Array.isArray(ip) ? ip[0] : ip}`;

    const check = limiter.isRateLimited(key);
    if (check.limited) {
      return res.status(429).json({
        error: options?.errorMessage || 'Too many requests. Please try again later.',
        retryAfterSeconds: check.retryAfterSeconds
      });
    }

    limiter.recordFailure(key);
    next();
  };
}

// 15 sensitive requests per minute per IP for sensitive auth operations
export const authEndpointRateLimiter = new RateLimiter(15, 60 * 1000, 60 * 1000);
export const authEndpointRateLimitMiddleware = createRateLimitMiddleware(authEndpointRateLimiter, {
  errorMessage: 'Too many authentication attempts. Please try again in 1 minute.'
});
