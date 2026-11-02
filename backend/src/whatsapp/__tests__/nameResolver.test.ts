import { describe, it, expect } from 'vitest';
import { resolveDisplayName, formatPhoneNumber } from '../nameResolver.js';

describe('Name Resolution Priority (Phase 2.1)', () => {
  it('priority 1: savedName wins over all other name candidates', () => {
    const name = resolveDisplayName({
      savedName: 'Mom',
      groupSubject: 'Family Group',
      verifiedName: 'Mom Business Inc',
      pushName: 'Alice M',
      phoneNumber: '919876543210',
      jid: '919876543210@s.whatsapp.net',
    });
    expect(name).toBe('Mom');
  });

  it('priority 2: groupSubject wins when savedName is absent', () => {
    const name = resolveDisplayName({
      savedName: null,
      groupSubject: 'Dev Team',
      verifiedName: 'Dev Org',
      pushName: 'John Dev',
      phoneNumber: '15551234567',
      jid: '123456789@g.us',
    });
    expect(name).toBe('Dev Team');
  });

  it('priority 3: verifiedName wins when savedName and groupSubject are absent', () => {
    const name = resolveDisplayName({
      savedName: undefined,
      groupSubject: null,
      verifiedName: 'Acme Official Store',
      pushName: 'Acme Shop',
      phoneNumber: '919876543210',
      jid: '919876543210@s.whatsapp.net',
    });
    expect(name).toBe('Acme Official Store');
  });

  it('priority 4: pushName wins when higher priority candidates are absent', () => {
    const name = resolveDisplayName({
      pushName: 'CoolHacker99',
      phoneNumber: '15551234567',
      jid: '15551234567@s.whatsapp.net',
    });
    expect(name).toBe('CoolHacker99');
  });

  it('priority 5: formatted phone number is used when only phone/JID is present', () => {
    const name = resolveDisplayName({
      phoneNumber: '919876543210',
      jid: '919876543210@s.whatsapp.net',
    });
    expect(name).toBe('+91 98765 43210');
  });

  it('priority 5b: extracts and formats phone number from JID if phoneNumber field is omitted', () => {
    const name = resolveDisplayName({
      jid: '15551234567@s.whatsapp.net',
    });
    expect(name).toBe('+1 555 123 4567');
  });

  it('priority 6: falls back to "Unknown" when all candidates are null or whitespace', () => {
    expect(resolveDisplayName({})).toBe('Unknown');
    expect(
      resolveDisplayName({
        savedName: '   ',
        pushName: '',
        phoneNumber: null,
      }),
    ).toBe('Unknown');
  });
});

describe('Phone Number Formatting', () => {
  it('formats Indian phone numbers correctly (+91 XXXXX XXXXX)', () => {
    expect(formatPhoneNumber('919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneNumber('919876543210@s.whatsapp.net')).toBe('+91 98765 43210');
    expect(formatPhoneNumber('919876543210:4@s.whatsapp.net')).toBe('+91 98765 43210');
  });

  it('formats North American numbers (+1 XXX XXX XXXX)', () => {
    expect(formatPhoneNumber('15551234567')).toBe('+1 555 123 4567');
    expect(formatPhoneNumber('+1 (555) 123-4567')).toBe('+1 555 123 4567');
  });

  it('formats UK numbers (+44 XXXX XXXXXX)', () => {
    expect(formatPhoneNumber('447123456789')).toBe('+44 7123 456789');
  });

  it('handles empty or non-numeric strings safely', () => {
    expect(formatPhoneNumber('')).toBe('');
    expect(formatPhoneNumber(null)).toBe('');
    expect(formatPhoneNumber('not-a-number')).toBe('');
  });
});
