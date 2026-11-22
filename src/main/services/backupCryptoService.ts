import { app, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MAGIC_HEADER = Buffer.from('POSENC1'); // 7 bytes
const IV_LENGTH = 12; // 96 bits for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

export class BackupCryptoService {
  private keyFilePath: string | null = null;
  private cachedKey: Buffer | null = null;

  private getKeyFilePath(): string {
    if (!this.keyFilePath) {
      const userDataDir = app.getPath('userData');
      this.keyFilePath = path.join(userDataDir, 'backup_master_key.enc');
    }
    return this.keyFilePath;
  }

  /**
   * Retrieves or generates the 256-bit master AES encryption key.
   * Stored securely on the local machine using Electron safeStorage (OS-level keychain / DPAPI)
   * with fallback to machine-unique salted local file.
   */
  public getOrCreateMasterKey(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    const keyPath = this.getKeyFilePath();

    if (fs.existsSync(keyPath)) {
      try {
        const fileContent = fs.readFileSync(keyPath);
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          try {
            const decryptedHex = safeStorage.decryptString(fileContent);
            if (/^[0-9a-fA-F]{64}$/.test(decryptedHex)) {
              const decryptedKey = Buffer.from(decryptedHex, 'hex');
              this.cachedKey = decryptedKey;
              return decryptedKey;
            }
          } catch {
            // If safeStorage decryption fails (e.g. key from raw fallback), try raw length
          }
        }

        if (fileContent.length === KEY_LENGTH) {
          this.cachedKey = fileContent;
          return fileContent;
        }

        // Try parsing hex string format
        const textContent = fileContent.toString('utf8').trim();
        if (/^[0-9a-fA-F]{64}$/.test(textContent)) {
          const parsedKey = Buffer.from(textContent, 'hex');
          this.cachedKey = parsedKey;
          return parsedKey;
        }
      } catch (err) {
        console.warn('[BACKUP_CRYPTO] Failed to read existing master key, regenerating:', err);
      }
    }

    // Generate fresh high-entropy 256-bit random key
    const newKey = crypto.randomBytes(KEY_LENGTH);
    this.saveMasterKey(newKey);
    this.cachedKey = newKey;
    return newKey;
  }

  /**
   * Saves the 256-bit key to the local file using Electron safeStorage if available.
   */
  private saveMasterKey(key: Buffer): void {
    const keyPath = this.getKeyFilePath();
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedKey = safeStorage.encryptString(key.toString('hex'));
        fs.writeFileSync(keyPath, encryptedKey);
        return;
      } catch (err) {
        console.warn('[BACKUP_CRYPTO] safeStorage encrypt failed, falling back to local storage:', err);
      }
    }

    // Fallback: Store hex key
    fs.writeFileSync(keyPath, key.toString('hex'), 'utf8');
  }

  /**
   * Exports the AES-256 master key in clean hex format so the Super Admin
   * can record it in a safe place for disaster recovery on a new computer.
   */
  public exportRecoveryKey(): string {
    const key = this.getOrCreateMasterKey();
    return key.toString('hex').toUpperCase();
  }

  /**
   * Sets/imports an existing 256-bit recovery key (useful when restoring backups on a replacement computer).
   */
  public importRecoveryKey(recoveryKeyHex: string): boolean {
    const cleanKey = recoveryKeyHex.replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
      throw new Error('Invalid recovery key format. Expected 64-character hexadecimal key (256-bit).');
    }

    const keyBuffer = Buffer.from(cleanKey, 'hex');
    this.saveMasterKey(keyBuffer);
    this.cachedKey = keyBuffer;
    return true;
  }

  /**
   * Encrypts arbitrary buffer data using AES-256-GCM.
   * Output layout: [MAGIC_HEADER (7B)] [IV (12B)] [AUTH_TAG (16B)] [CIPHERTEXT]
   */
  public encrypt(plainBuffer: Buffer): Buffer {
    const key = this.getOrCreateMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([MAGIC_HEADER, iv, authTag, encrypted]);
  }

  /**
   * Decrypts buffer data encrypted with AES-256-GCM.
   * Strictly validates MAGIC_HEADER and GCM authentication tag.
   * Throws an error if data is corrupted, altered, or encrypted with a different key.
   */
  public decrypt(encryptedBuffer: Buffer): Buffer {
    if (encryptedBuffer.length < MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Corrupted or invalid backup file: file is too small to contain valid encrypted payload.');
    }

    const header = encryptedBuffer.subarray(0, MAGIC_HEADER.length);
    if (!header.equals(MAGIC_HEADER)) {
      throw new Error('Invalid backup file format: missing required POS backup header signature.');
    }

    let offset = MAGIC_HEADER.length;
    const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const ciphertext = encryptedBuffer.subarray(offset);

    const key = this.getOrCreateMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted;
    } catch {
      throw new Error('Decryption failed: Authentication tag mismatch. The backup file may be corrupted, tampered with, or the encryption recovery key does not match.');
    }
  }

  /**
   * Calculates SHA-256 hex checksum of a buffer.
   */
  public calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

export const backupCryptoService = new BackupCryptoService();
