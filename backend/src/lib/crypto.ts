import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Derive 32-byte binary key from base64 string
const getKey = (): Buffer => Buffer.from(env.ENCRYPTION_KEY, 'base64');

/**
 * Encrypt plaintext using AES-256-GCM.
 * Output format: ivHex:authTagHex:encryptedHex
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt ciphertext produced by AES-256-GCM.
 * Throws an Error if tampered or invalid.
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext structure. Expected iv:authTag:encrypted');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('Invalid IV or auth tag length for AES-256-GCM');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
