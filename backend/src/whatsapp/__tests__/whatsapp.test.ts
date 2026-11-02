import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { calculateBackoff, classifyDisconnectReason } from '../backoff.js';

describe('AES-256-GCM Encryption & Decryption', () => {
  it('should encrypt and decrypt plaintext successfully round-trip', () => {
    const secretMessage = JSON.stringify({
      creds: { registrationId: 12345, signedIdentityKey: 'abc-key' },
    });

    const ciphertext = encrypt(secretMessage);
    expect(ciphertext).toBeDefined();
    expect(ciphertext).not.toBe(secretMessage);
    expect(ciphertext.split(':')).toHaveLength(3);

    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(secretMessage);
  });

  it('should throw an error if ciphertext has been tampered with', () => {
    const original = encrypt('confidential credentials');
    const parts = original.split(':');
    // Tamper with the encrypted payload part by flipping the first character
    const flippedChar = parts[2][0] === 'a' ? 'b' : 'a';
    parts[2] = flippedChar + parts[2].slice(1);

    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('should throw an error for malformed ciphertext format', () => {
    expect(() => decrypt('not-a-valid-ciphertext')).toThrow();
  });
});

describe('Disconnect Reason Classification', () => {
  it('should classify 401 as wipe_logout', () => {
    expect(classifyDisconnectReason(401)).toBe('wipe_logout');
  });

  it('should classify 515 as restart_immediate', () => {
    expect(classifyDisconnectReason(515)).toBe('restart_immediate');
  });

  it('should classify 440 as stop_replaced', () => {
    expect(classifyDisconnectReason(440)).toBe('stop_replaced');
  });

  it('should classify 408, 428, 503 and undefined as reconnect_backoff', () => {
    expect(classifyDisconnectReason(408)).toBe('reconnect_backoff');
    expect(classifyDisconnectReason(428)).toBe('reconnect_backoff');
    expect(classifyDisconnectReason(503)).toBe('reconnect_backoff');
    expect(classifyDisconnectReason(undefined)).toBe('reconnect_backoff');
  });
});

describe('Exponential Backoff Calculation', () => {
  it('should calculate exponential delay within bounds without jitter', () => {
    expect(calculateBackoff(0, 1000, 60000, false)).toBe(1000);
    expect(calculateBackoff(1, 1000, 60000, false)).toBe(2000);
    expect(calculateBackoff(2, 1000, 60000, false)).toBe(4000);
    expect(calculateBackoff(3, 1000, 60000, false)).toBe(8000);
  });

  it('should cap delay at maxMs', () => {
    expect(calculateBackoff(10, 1000, 60000, false)).toBe(60000);
  });

  it('should add randomized jitter within 0-1000ms', () => {
    const delayWithJitter = calculateBackoff(1, 1000, 60000, true);
    expect(delayWithJitter).toBeGreaterThanOrEqual(2000);
    expect(delayWithJitter).toBeLessThanOrEqual(3000);
  });
});
