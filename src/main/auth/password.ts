import * as crypto from 'crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const ALGORITHM_PREFIX = 'scrypt';

/**
 * Hashes a plain-text password using Node.js crypto.scrypt with a cryptographically secure random salt.
 * Output format: scrypt:<hex_salt>:<hex_derived_key>
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `${ALGORITHM_PREFIX}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Securely verifies a plain-text password against a stored scrypt hash using timingSafeEqual
 * to eliminate timing-based side-channel attacks.
 */
export function verifyPassword(password: string, combinedHash: string): boolean {
  if (!password || !combinedHash || typeof password !== 'string' || typeof combinedHash !== 'string') {
    return false;
  }

  const parts = combinedHash.split(':');
  if (parts.length !== 3 || parts[0] !== ALGORITHM_PREFIX) {
    return false;
  }

  const salt = parts[1];
  const storedHashHex = parts[2];

  try {
    const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH);
    const storedBuffer = Buffer.from(storedHashHex, 'hex');

    if (storedBuffer.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, derivedKey);
  } catch {
    return false;
  }
}
