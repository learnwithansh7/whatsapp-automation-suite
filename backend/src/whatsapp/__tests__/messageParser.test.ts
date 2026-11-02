import { describe, it, expect } from 'vitest';
import {
  parseWAMessage,
  normalizeTimestamp,
  mapMessageStatus,
  getMessagePreviewText,
} from '../messageParser.js';
import type { proto } from '@whiskeysockets/baileys';

describe('normalizeTimestamp', () => {
  it('should correctly normalize unix timestamps in seconds', () => {
    const seconds = 1700000000;
    const date = normalizeTimestamp(seconds);
    expect(date.getTime()).toBe(seconds * 1000);
  });

  it('should correctly normalize unix timestamps in milliseconds', () => {
    const ms = 1700000000000;
    const date = normalizeTimestamp(ms);
    expect(date.getTime()).toBe(ms);
  });

  it('should correctly normalize Long object from protobuf', () => {
    const longObj = { low: 1700000000, high: 0, unsigned: true };
    const date = normalizeTimestamp(longObj);
    expect(date.getTime()).toBe(1700000000 * 1000);
  });

  it('should fallback to current time on empty or null values', () => {
    const before = Date.now();
    const date = normalizeTimestamp(null);
    const after = Date.now();
    expect(date.getTime()).toBeGreaterThanOrEqual(before);
    expect(date.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('mapMessageStatus', () => {
  it('maps numeric Baileys statuses correctly', () => {
    expect(mapMessageStatus(1)).toBe('pending');
    expect(mapMessageStatus(2)).toBe('sent');
    expect(mapMessageStatus(3)).toBe('delivered');
    expect(mapMessageStatus(4)).toBe('read');
    expect(mapMessageStatus(5)).toBe('read');
  });

  it('maps string statuses correctly', () => {
    expect(mapMessageStatus('PENDING')).toBe('pending');
    expect(mapMessageStatus('SERVER_ACK')).toBe('sent');
    expect(mapMessageStatus('DELIVERY_ACK')).toBe('delivered');
    expect(mapMessageStatus('READ')).toBe('read');
    expect(mapMessageStatus('PLAYED')).toBe('read');
  });
});

describe('getMessagePreviewText', () => {
  it('formats previews for different message types', () => {
    expect(getMessagePreviewText('text', 'Hello world', null)).toBe('Hello world');
    expect(getMessagePreviewText('image', null, 'Look at this photo')).toBe('📷 Look at this photo');
    expect(getMessagePreviewText('image', null, null)).toBe('📷 Photo');
    expect(getMessagePreviewText('video', null, null)).toBe('🎥 Video');
    expect(getMessagePreviewText('audio', null, null)).toBe('🎤 Voice message');
    expect(getMessagePreviewText('document', null, null, 'report.pdf')).toBe('📄 report.pdf');
    expect(getMessagePreviewText('sticker', null, null)).toBe('🎨 Sticker');
    expect(getMessagePreviewText('reaction', '❤️', null)).toBe('Reacted ❤️');
  });
});

describe('parseWAMessage', () => {
  const sessionId = 'session-test-123';

  it('parses plain text conversation message', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'msg-text-1',
        remoteJid: '1234567890@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'Hey there! How are you?',
      },
      messageTimestamp: 1700000000,
      status: 3,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('msg-text-1');
    expect(parsed?.chatJid).toBe('1234567890@s.whatsapp.net');
    expect(parsed?.senderJid).toBe('1234567890@s.whatsapp.net');
    expect(parsed?.fromMe).toBe(false);
    expect(parsed?.type).toBe('text');
    expect(parsed?.text).toBe('Hey there! How are you?');
    expect(parsed?.status).toBe('delivered');
  });

  it('parses extendedTextMessage with context reply', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'msg-reply-1',
        remoteJid: '1234567890@s.whatsapp.net',
        fromMe: true,
      },
      message: {
        extendedTextMessage: {
          text: 'I am doing great!',
          contextInfo: {
            stanzaId: 'msg-text-1',
            participant: '1234567890@s.whatsapp.net',
          },
        },
      },
      messageTimestamp: 1700000010,
      status: 2,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed?.type).toBe('text');
    expect(parsed?.text).toBe('I am doing great!');
    expect(parsed?.fromMe).toBe(true);
    expect(parsed?.replyToMessageId).toBe('msg-text-1');
    expect(parsed?.status).toBe('sent');
  });

  it('parses group message with participant sender', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'group-msg-1',
        remoteJid: '12036302@g.us',
        participant: '9876543210@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'Hello group!',
      },
      messageTimestamp: 1700000020,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed?.chatJid).toBe('12036302@g.us');
    expect(parsed?.senderJid).toBe('9876543210@s.whatsapp.net');
    expect(parsed?.fromMe).toBe(false);
    expect(parsed?.text).toBe('Hello group!');
  });

  it('parses image message metadata without downloading binary', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'img-msg-1',
        remoteJid: '1234567890@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        imageMessage: {
          caption: 'Sunset picture',
          mimetype: 'image/jpeg',
          fileLength: 450000,
        },
      },
      messageTimestamp: 1700000030,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed?.type).toBe('image');
    expect(parsed?.caption).toBe('Sunset picture');
    expect(parsed?.mediaMime).toBe('image/jpeg');
    expect(parsed?.mediaSize).toBe(450000);
  });

  it('detects message revoke (delete for everyone)', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'revoke-action-id',
        remoteJid: '1234567890@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        protocolMessage: {
          key: {
            id: 'original-msg-to-delete',
            remoteJid: '1234567890@s.whatsapp.net',
          },
          type: 0, // REVOKE
        },
      },
      messageTimestamp: 1700000040,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed?.isRevoke).toBe(true);
    expect(parsed?.targetRevokeId).toBe('original-msg-to-delete');
  });

  it('sanitizes raw payload to prevent binary data in JSON', () => {
    const raw: proto.IWebMessageInfo = {
      key: {
        id: 'sanitized-test',
        remoteJid: '1234567890@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'Test sanitization',
        imageMessage: {
          mediaKey: Buffer.from('secret-key') as unknown as Uint8Array,
        },
      },
      messageTimestamp: 1700000050,
    };

    const parsed = parseWAMessage(raw, sessionId);
    expect(parsed?.raw).toBeDefined();
    // Buffer should be stripped or converted
    expect(parsed?.raw?.message).toBeDefined();
  });
});
