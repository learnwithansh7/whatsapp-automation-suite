/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergeService } from '../mergeService.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    chat: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
    },
  },
}));

describe('MergeService - LID & Phone Chat Unification (Phase 2.1)', () => {
  let service: MergeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MergeService();
  });

  it('returns false if phoneJid and lidJid are identical', async () => {
    const res = await service.mergeLidAndPhoneChats('sess-1', '123@s.whatsapp.net', '123@s.whatsapp.net');
    expect(res).toBe(false);
  });

  it('returns false if LID chat does not exist in DB', async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue(null);
    const res = await service.mergeLidAndPhoneChats('sess-1', '123@s.whatsapp.net', '456@lid');
    expect(res).toBe(false);
  });

  it('re-links messages and merges LID chat into existing Phone chat', async () => {
    const phoneChat = {
      id: 'chat-phone',
      sessionId: 'sess-1',
      jid: '123@s.whatsapp.net',
      unreadCount: 2,
      lastMessageAt: new Date(1000),
      isPinned: false,
      isArchived: false,
      isMuted: false,
    };

    const lidChat = {
      id: 'chat-lid',
      sessionId: 'sess-1',
      jid: '456@lid',
      unreadCount: 3,
      lastMessageAt: new Date(2000),
      lastMessageId: 'msg-lid-2',
      lastMessageText: 'Hello from LID',
      lastMessageFromMe: false,
      isPinned: true,
      isArchived: false,
      isMuted: false,
    };

    vi.mocked(prisma.chat.findUnique)
      .mockResolvedValueOnce(phoneChat as any) // phoneChat
      .mockResolvedValueOnce(lidChat as any); // lidChat

    vi.mocked(prisma.message.findMany).mockResolvedValueOnce([
      { id: 'msg-1', sessionId: 'sess-1', chatJid: '456@lid' },
      { id: 'msg-2', sessionId: 'sess-1', chatJid: '456@lid' },
    ] as any);

    // First message already exists on phone chat (duplicate), second is new
    vi.mocked(prisma.message.findUnique)
      .mockResolvedValueOnce({ id: 'msg-1' } as any)
      .mockResolvedValueOnce(null);

    const res = await service.mergeLidAndPhoneChats('sess-1', '123@s.whatsapp.net', '456@lid');

    expect(res).toBe(true);

    // Duplicate message deleted
    expect(prisma.message.delete).toHaveBeenCalledWith({
      where: {
        sessionId_chatJid_id: {
          sessionId: 'sess-1',
          chatJid: '456@lid',
          id: 'msg-1',
        },
      },
    });

    // Unique message re-linked to phone chat
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: {
        sessionId_chatJid_id: {
          sessionId: 'sess-1',
          chatJid: '456@lid',
          id: 'msg-2',
        },
      },
      data: {
        chatJid: '123@s.whatsapp.net',
      },
    });

    // Phone chat updated with combined unreadCount (2 + 3 = 5) and latest LID message stats
    expect(prisma.chat.update).toHaveBeenCalledWith({
      where: { sessionId_jid: { sessionId: 'sess-1', jid: '123@s.whatsapp.net' } },
      data: expect.objectContaining({
        unreadCount: 5,
        isPinned: true,
        lastMessageId: 'msg-lid-2',
        lastMessageText: 'Hello from LID',
      }),
    });

    // Duplicate LID chat deleted
    expect(prisma.chat.delete).toHaveBeenCalledWith({
      where: { sessionId_jid: { sessionId: 'sess-1', jid: '456@lid' } },
    });
  });

  it('promotes LID chat to Phone JID when no phone chat previously existed', async () => {
    const lidChat = {
      id: 'chat-lid',
      sessionId: 'sess-1',
      jid: '456@lid',
      type: 'private',
      name: 'Alice',
      lastMessageId: 'msg-1',
      lastMessageText: 'Hey',
      lastMessageAt: new Date(),
      lastMessageFromMe: true,
      unreadCount: 0,
      isPinned: false,
      isArchived: false,
      isMuted: false,
    };

    vi.mocked(prisma.chat.findUnique)
      .mockResolvedValueOnce(null) // phoneChat does not exist
      .mockResolvedValueOnce(lidChat as any); // lidChat exists

    vi.mocked(prisma.message.findMany).mockResolvedValueOnce([]);

    const res = await service.mergeLidAndPhoneChats('sess-1', '123@s.whatsapp.net', '456@lid');

    expect(res).toBe(true);

    // Creates new chat with phone JID
    expect(prisma.chat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'sess-1',
        jid: '123@s.whatsapp.net',
        name: 'Alice',
      }),
    });

    // Deletes old LID chat
    expect(prisma.chat.delete).toHaveBeenCalledWith({
      where: { sessionId_jid: { sessionId: 'sess-1', jid: '456@lid' } },
    });
  });
});
