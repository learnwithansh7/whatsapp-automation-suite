/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendQueueService } from '../../services/sendQueue.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    outbox: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    chat: {
      update: vi.fn(),
    },
  },
}));

vi.mock('../../services/mediaStorage.js', () => ({
  mediaStorage: {
    getMediaStream: vi.fn(),
    saveMedia: vi.fn(),
  },
}));

describe('SendQueueService - Anti-Ban & Rate Limiting (Phase 3)', () => {
  let queue: SendQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new SendQueueService();
  });

  it('calculates jitter delay within configured bounds (1500ms - 3500ms)', () => {
    for (let i = 0; i < 50; i++) {
      const delay = queue.calculateJitterDelay();
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(3500);
    }
  });

  it('calculates composing presence duration proportional to text length and capped at 4000ms', () => {
    // Short message -> min 600ms
    expect(queue.calculateComposingDuration(5)).toBe(600);
    // Medium message -> length * 50ms (30 chars = 1500ms)
    expect(queue.calculateComposingDuration(30)).toBe(1500);
    // Long message -> capped at 4000ms
    expect(queue.calculateComposingDuration(150)).toBe(4000);
  });

  it('enforces 20 messages per minute rate limit', () => {
    const sessionId = 'test-session-ratelimit';

    // First 19 checks are not limited
    for (let i = 0; i < 19; i++) {
      expect(queue.isRateLimited(sessionId).isLimited).toBe(false);
      (queue as any).recordSend(sessionId);
    }

    // 20th send
    (queue as any).recordSend(sessionId);

    // 21st check should trigger rate limit
    const limitCheck = queue.isRateLimited(sessionId);
    expect(limitCheck.isLimited).toBe(true);
    expect(limitCheck.reason).toContain('max 20 messages/minute');
    expect(limitCheck.resetInSeconds).toBeGreaterThan(0);
  });

  it('cancel() cancels a queued outbox message successfully', async () => {
    vi.mocked(prisma.outbox.findUnique).mockResolvedValueOnce({
      id: 'outbox-1',
      status: 'queued',
    } as any);

    const cancelled = await queue.cancel('outbox-1');
    expect(cancelled).toBe(true);
    expect(prisma.outbox.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'cancelled' },
    });
  });

  it('cancel() returns false if message is not in queued state', async () => {
    vi.mocked(prisma.outbox.findUnique).mockResolvedValueOnce({
      id: 'outbox-2',
      status: 'sent',
    } as any);

    const cancelled = await queue.cancel('outbox-2');
    expect(cancelled).toBe(false);
    expect(prisma.outbox.update).not.toHaveBeenCalled();
  });

  it('retry() requeues a failed outbox message', async () => {
    vi.mocked(prisma.outbox.findUnique).mockResolvedValueOnce({
      id: 'outbox-failed-1',
      sessionId: 'sess-1',
      status: 'failed',
    } as any);

    const retried = await queue.retry('outbox-failed-1');
    expect(retried).toBe(true);
    expect(prisma.outbox.update).toHaveBeenCalledWith({
      where: { id: 'outbox-failed-1' },
      data: expect.objectContaining({
        status: 'queued',
        attempts: 0,
        lastError: null,
      }),
    });
  });
});
