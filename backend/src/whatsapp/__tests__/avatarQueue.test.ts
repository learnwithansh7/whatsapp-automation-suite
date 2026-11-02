/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarQueue } from '../../services/avatarQueue.js';
import { prisma } from '../../lib/prisma.js';
import { avatarStorage } from '../../services/avatarStorage.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../services/avatarStorage.js', () => ({
  avatarStorage: {
    avatarExists: vi.fn(),
    saveAvatar: vi.fn(),
  },
}));

describe('AvatarQueue & 7-Day Suppression Rule (Phase 2.1)', () => {
  let queue: AvatarQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new AvatarQueue();
  });

  it('should return true if forceRefresh is true', async () => {
    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net', true);
    expect(should).toBe(true);
  });

  it('should return true if contact is not in database', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce(null as any);
    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net');
    expect(should).toBe(true);
  });

  it('7-day rule: suppresses query if status is "hidden" and within 7 days', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      sessionId: 'sess-1',
      jid: '123@s.whatsapp.net',
      profilePictureStatus: 'hidden',
      profilePictureUpdatedAt: threeDaysAgo,
    } as any);

    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net');
    expect(should).toBe(false);
  });

  it('7-day rule: suppresses query if status is "none" and within 7 days', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      sessionId: 'sess-1',
      jid: '123@s.whatsapp.net',
      profilePictureStatus: 'none',
      profilePictureUpdatedAt: fiveDaysAgo,
    } as any);

    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net');
    expect(should).toBe(false);
  });

  it('7-day rule: allows query if status is "none" or "hidden" but more than 7 days old', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      sessionId: 'sess-1',
      jid: '123@s.whatsapp.net',
      profilePictureStatus: 'none',
      profilePictureUpdatedAt: eightDaysAgo,
    } as any);

    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net');
    expect(should).toBe(true);
  });

  it('skips query if status is "ok", file exists on disk, and within 7 days', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      sessionId: 'sess-1',
      jid: '123@s.whatsapp.net',
      profilePictureStatus: 'ok',
      profilePictureUrl: 'sess-1/123.jpg',
      profilePictureUpdatedAt: twoDaysAgo,
    } as any);
    vi.mocked(avatarStorage.avatarExists).mockResolvedValueOnce(true);

    const should = await queue.shouldFetchAvatar('sess-1', '123@s.whatsapp.net');
    expect(should).toBe(false);
  });

  it('deduplicates simultaneous enqueue calls for the same JID and type', () => {
    // Avoid triggering auto execution by not providing a socket
    const first = queue.enqueue('sess-1', '123@s.whatsapp.net', 'preview');
    const second = queue.enqueue('sess-1', '123@s.whatsapp.net', 'preview');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
