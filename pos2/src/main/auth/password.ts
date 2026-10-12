import * as crypto from 'crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [, salt, hashHex] = parts;
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const targetBuffer = Buffer.from(hashHex, 'hex');

  if (derivedKey.length !== targetBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, targetBuffer);
}
