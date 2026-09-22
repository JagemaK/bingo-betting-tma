import crypto from 'crypto';

/**
 * Modern Memory-Hard Password Hashing Utilities (OWASP Recommended)
 *
 * Algorithm: Scrypt
 * Parameters:
 * - N = 16384 (CPU/memory cost factor)
 * - r = 8 (block size factor)
 * - p = 1 (parallelization factor)
 * - keylen = 64 bytes (512 bits)
 *
 * Encoded format:
 * $scrypt$N=16384,r=8,p=1$<saltHex>$<derivedKeyHex>
 *
 * Also provides transparent backward-compatibility verification for:
 * - Legacy PBKDF2 hashes (1000 iterations sha512)
 * - Legacy fallback hashes ('password123')
 */

export interface PasswordVerificationResult {
  isValid: boolean;
  needsRehash: boolean;
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const saltBytes = crypto.randomBytes(16);
  const saltHex = saltBytes.toString('hex');

  const derivedKey = crypto.scryptSync(password, saltBytes, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024
  });

  const hashString = `$scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${saltHex}$${derivedKey.toString('hex')}`;
  return { hash: hashString, salt: saltHex };
}

export function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
  storedSalt?: string | null
): PasswordVerificationResult {
  if (!password) {
    return { isValid: false, needsRehash: false };
  }

  // Handle seeded accounts without password hash (default demo password fallback, auto-upgrades to Scrypt on login)
  if (!storedHash) {
    if (password === 'password123') {
      return { isValid: true, needsRehash: true };
    }
    return { isValid: false, needsRehash: false };
  }

  // Case 1: Modern $scrypt$ hash format
  if (storedHash.startsWith('$scrypt$')) {
    try {
      const parts = storedHash.split('$');
      // Format: ["", "scrypt", "N=16384,r=8,p=1", "<saltHex>", "<derivedKeyHex>"]
      if (parts.length === 5) {
        const params = parts[2];
        const saltHex = parts[3];
        const keyHex = parts[4];

        let n = SCRYPT_N;
        let r = SCRYPT_R;
        let p = SCRYPT_P;

        params.split(',').forEach((kv) => {
          const [k, v] = kv.split('=');
          if (k === 'N') n = parseInt(v, 10);
          if (k === 'r') r = parseInt(v, 10);
          if (k === 'p') p = parseInt(v, 10);
        });

        const saltBytes = Buffer.from(saltHex, 'hex');
        const expectedKey = Buffer.from(keyHex, 'hex');

        const derivedKey = crypto.scryptSync(password, saltBytes, expectedKey.length, {
          N: n,
          r,
          p,
          maxmem: 32 * 1024 * 1024
        });

        // Constant-time comparison prevents timing side-channel attacks
        const isValid =
          derivedKey.length === expectedKey.length &&
          crypto.timingSafeEqual(derivedKey, expectedKey);

        return { isValid, needsRehash: false };
      }
    } catch (e) {
      return { isValid: false, needsRehash: false };
    }
  }

  // Case 2: Legacy PBKDF2 (1000 iterations sha512)
  if (storedSalt) {
    try {
      const computed = crypto.pbkdf2Sync(password, storedSalt, 1000, 64, 'sha512').toString('hex');
      const computedBuf = Buffer.from(computed, 'utf8');
      const storedBuf = Buffer.from(storedHash, 'utf8');

      const isValid =
        computedBuf.length === storedBuf.length &&
        crypto.timingSafeEqual(computedBuf, storedBuf);

      if (isValid) {
        // Successful match with legacy hash: Flag for transparent rehash
        return { isValid: true, needsRehash: true };
      }
    } catch {
      // Fall through
    }
  }

  // Case 3: Legacy hardcoded fallback password for initial mock accounts ('password123')
  if (storedHash === 'password123' || (!storedSalt && password === 'password123')) {
    return { isValid: password === 'password123', needsRehash: true };
  }

  return { isValid: false, needsRehash: false };
}
