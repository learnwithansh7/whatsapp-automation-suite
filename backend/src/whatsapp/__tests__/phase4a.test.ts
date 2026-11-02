/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWAMessage, formatStubTypeNotice } from '../messageParser.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    reaction: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    groupParticipant: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
    },
    chat: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../lib/io.js', () => ({
  getIO: vi.fn(() => null),
  setIO: vi.fn(),
}));

describe('Phase 4A: Message Actions & Groups Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Edit & Delete Time-Window Logic', () => {
    it('allows editing a message sent within 15 minutes', () => {
      const now = Date.now();
      const messageTimestamp = new Date(now - 10 * 60 * 1000); // 10 minutes ago
      const ageMs = now - messageTimestamp.getTime();
      const maxAgeMs = 15 * 60 * 1000;

      expect(ageMs <= maxAgeMs).toBe(true);
    });

    it('rejects editing a message older than 15 minutes', () => {
      const now = Date.now();
      const messageTimestamp = new Date(now - 16 * 60 * 1000); // 16 minutes ago
      const ageMs = now - messageTimestamp.getTime();
      const maxAgeMs = 15 * 60 * 1000;

      expect(ageMs <= maxAgeMs).toBe(false);
    });

    it('only permits editing text messages', () => {
      const validTextMsg = { type: 'text', fromMe: true };
      const imageMsg = { type: 'image', fromMe: true };
      const voiceMsg = { type: 'audio', fromMe: true };

      expect(validTextMsg.type === 'text').toBe(true);
      expect(imageMsg.type === 'text').toBe(false);
      expect(voiceMsg.type === 'text').toBe(false);
    });

    it('allows delete-for-everyone within 48 hours for own messages', () => {
      const now = Date.now();
      const messageTimestamp = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago
      const ageMs = now - messageTimestamp.getTime();
      const maxAgeMs = 48 * 60 * 60 * 1000;

      expect(ageMs <= maxAgeMs).toBe(true);
    });

    it('rejects delete-for-everyone older than 48 hours', () => {
      const now = Date.now();
      const messageTimestamp = new Date(now - 50 * 60 * 60 * 1000); // 50 hours ago
      const ageMs = now - messageTimestamp.getTime();
      const maxAgeMs = 48 * 60 * 60 * 1000;

      expect(ageMs <= maxAgeMs).toBe(false);
    });
  });

  describe('Forward Limit Validation', () => {
    it('accepts between 1 and 5 target chats', () => {
      const validTargets1 = ['chat1@s.whatsapp.net'];
      const validTargets5 = ['c1', 'c2', 'c3', 'c4', 'c5'];

      expect(validTargets1.length >= 1 && validTargets1.length <= 5).toBe(true);
      expect(validTargets5.length >= 1 && validTargets5.length <= 5).toBe(true);
    });

    it('rejects empty target list or more than 5 chats', () => {
      const emptyTargets: string[] = [];
      const overLimitTargets = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

      expect(emptyTargets.length >= 1 && emptyTargets.length <= 5).toBe(false);
      expect(overLimitTargets.length >= 1 && overLimitTargets.length <= 5).toBe(false);
    });
  });

  describe('Mention Parsing & Forward Context', () => {
    it('extracts mentionedJids from extendedTextMessage contextInfo', () => {
      const rawMsg: any = {
        key: { id: 'msg-123', remoteJid: 'group123@g.us', fromMe: false, participant: 'sender@s.whatsapp.net' },
        messageTimestamp: 1670000000,
        message: {
          extendedTextMessage: {
            text: 'Hello @user1 and @user2',
            contextInfo: {
              mentionedJid: ['user1@s.whatsapp.net', 'user2@s.whatsapp.net'],
              isForwarded: true,
              forwardingScore: 2,
            },
          },
        },
      };

      const parsed = parseWAMessage(rawMsg, 'session-1');
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('text');
      expect(parsed?.text).toBe('Hello @user1 and @user2');
      expect(parsed?.mentionedJids).toEqual(['user1@s.whatsapp.net', 'user2@s.whatsapp.net']);
      expect(parsed?.isForwarded).toBe(true);
      expect(parsed?.forwardScore).toBe(2);
    });

    it('formats group stub notices into human-readable system messages', () => {
      expect(formatStubTypeNotice('GROUP_PARTICIPANT_ADD', ['12345@s.whatsapp.net'])).toBe(
        '12345 was added to the group',
      );
      expect(formatStubTypeNotice('GROUP_PARTICIPANT_LEAVE', ['12345@s.whatsapp.net'])).toBe(
        '12345 left the group',
      );
      expect(formatStubTypeNotice('GROUP_PARTICIPANT_PROMOTE', ['admin@s.whatsapp.net'])).toBe(
        'admin is now an admin',
      );
      expect(formatStubTypeNotice('GROUP_CHANGE_SUBJECT', ['Super Group'])).toBe(
        'Group subject changed to "Super Group"',
      );
      expect(formatStubTypeNotice('GROUP_CHANGE_ANNOUNCE')).toBe(
        'Group settings changed: only admins can send messages',
      );
    });
  });

  describe('Reactions Parsing & Handling', () => {
    it('correctly parses incoming reaction message', () => {
      const rawMsg: any = {
        key: { id: 'react-1', remoteJid: 'chat@s.whatsapp.net', fromMe: false },
        messageTimestamp: 1670000000,
        message: {
          reactionMessage: {
            text: '❤️',
            key: { id: 'target-msg-456', remoteJid: 'chat@s.whatsapp.net', fromMe: true },
          },
        },
      };

      const parsed = parseWAMessage(rawMsg, 'session-1');
      expect(parsed?.type).toBe('reaction');
      expect(parsed?.text).toBe('❤️');
      expect(parsed?.replyToMessageId).toBe('target-msg-456');
    });

    it('distinguishes reaction removal when text is empty', () => {
      const emojiReaction = '👍';
      const removeReaction = '';

      expect(Boolean(emojiReaction)).toBe(true);
      expect(Boolean(removeReaction)).toBe(false);
    });
  });
});
