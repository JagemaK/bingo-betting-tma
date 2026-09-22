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
