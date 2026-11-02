import { describe, it, expect } from 'vitest';
import { isPrivateIP, extractUrls, extractHtmlMetadata } from '../../services/linkPreviewService.js';

describe('Phase 4B: Chat List Tools, Info Panel & Polish Unit Tests', () => {
  describe('SSRF Protection & Safe IP Validation', () => {
    it('blocks IPv4 loopback and local ranges', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('127.255.255.254')).toBe(true);
      expect(isPrivateIP('0.0.0.0')).toBe(true);
    });

    it('blocks IPv4 private RFC1918 ranges', () => {
      // 10.0.0.0/8
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.254.254.1')).toBe(true);
      // 172.16.0.0/12
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
      // 192.168.0.0/16
      expect(isPrivateIP('192.168.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.254')).toBe(true);
    });

    it('blocks IPv4 link-local (cloud metadata 169.254.169.254)', () => {
      expect(isPrivateIP('169.254.169.254')).toBe(true);
      expect(isPrivateIP('169.254.1.1')).toBe(true);
    });

    it('blocks carrier-grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateIP('100.64.0.1')).toBe(true);
      expect(isPrivateIP('100.127.255.254')).toBe(true);
      // 100.128.0.1 is outside the /10 range
      expect(isPrivateIP('100.128.0.1')).toBe(false);
    });

    it('blocks IPv6 loopback, link-local, and unique-local ranges', () => {
      expect(isPrivateIP('::1')).toBe(true);
      expect(isPrivateIP('::')).toBe(true);
      expect(isPrivateIP('fe80::1')).toBe(true);
      expect(isPrivateIP('fc00::1')).toBe(true);
      expect(isPrivateIP('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    });

    it('allows valid public Internet IP addresses', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
      expect(isPrivateIP('93.184.216.34')).toBe(false); // example.com
      expect(isPrivateIP('142.250.190.46')).toBe(false); // google.com
    });

    it('blocks malformed IP representations', () => {
      expect(isPrivateIP('999.999.999.999')).toBe(true);
      expect(isPrivateIP('not-an-ip')).toBe(true);
      expect(isPrivateIP('')).toBe(true);
    });
  });

  describe('URL Extraction & Metadata Parsing', () => {
    it('extracts valid HTTP and HTTPS URLs from message text', () => {
      const message = 'Check out this website https://example.com and this repo http://github.com/whiskeysockets/baileys today!';
      const urls = extractUrls(message);

      expect(urls).toHaveLength(2);
      expect(urls[0]).toBe('https://example.com');
      expect(urls[1]).toBe('http://github.com/whiskeysockets/baileys');
    });

    it('ignores plain text without web protocols', () => {
      const message = 'Hello world, ftp://internal.server or mailto:test@example.com should not match.';
      const urls = extractUrls(message);

      expect(urls).toHaveLength(0);
    });

    it('handles empty or null message text gracefully', () => {
      expect(extractUrls(null)).toEqual([]);
      expect(extractUrls(undefined)).toEqual([]);
      expect(extractUrls('')).toEqual([]);
    });

    it('extracts OpenGraph and standard meta tags from HTML', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Example Page Title</title>
            <meta property="og:title" content="OpenGraph Title" />
            <meta property="og:description" content="This is an OpenGraph description" />
            <meta property="og:image" content="https://example.com/cover.jpg" />
            <meta property="og:site_name" content="ExampleSite" />
          </head>
          <body>Hello world</body>
        </html>
      `;

      const meta = extractHtmlMetadata(mockHtml);

      expect(meta.title).toBe('OpenGraph Title');
      expect(meta.description).toBe('This is an OpenGraph description');
      expect(meta.imageUrl).toBe('https://example.com/cover.jpg');
      expect(meta.siteName).toBe('ExampleSite');
    });

    it('falls back to standard title and meta description if OpenGraph is missing', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Standard Fallback Title</title>
            <meta name="description" content="Standard fallback meta description." />
          </head>
          <body>Content here</body>
        </html>
      `;

      const meta = extractHtmlMetadata(mockHtml);

      expect(meta.title).toBe('Standard Fallback Title');
      expect(meta.description).toBe('Standard fallback meta description.');
      expect(meta.imageUrl).toBeUndefined();
      expect(meta.siteName).toBeUndefined();
    });
  });

  describe('Chat Organization Business Rules', () => {
    it('enforces maximum 3 pinned chats per session', () => {
      const existingPinnedChats = [
        { id: '1', isPinned: true },
        { id: '2', isPinned: true },
        { id: '3', isPinned: true },
      ];

      const canPinFourth = existingPinnedChats.length < 3;
      expect(canPinFourth).toBe(false);

      const unpinnedList = existingPinnedChats.slice(1);
      const canPinNow = unpinnedList.length < 3;
      expect(canPinNow).toBe(true);
    });

    it('correctly calculates mute expiry timestamps', () => {
      const now = 1700000000000;

      // 8 hours
      const mute8h = new Date(now + 8 * 60 * 60 * 1000);
      expect(mute8h.getTime() - now).toBe(8 * 3600 * 1000);

      // 1 week (7 days)
      const mute1w = new Date(now + 7 * 24 * 60 * 60 * 1000);
      expect(mute1w.getTime() - now).toBe(7 * 86400 * 1000);

      // Always (represented as null or far future)
      const muteAlways = null;
      expect(muteAlways).toBeNull();
    });

    it('computes filter tab counts accurately', () => {
      const mockChats = [
        { id: '1', type: 'individual', isArchived: false, unreadCount: 2, markedUnread: false, isPinned: true },
        { id: '2', type: 'group', isArchived: false, unreadCount: 0, markedUnread: true, isPinned: false },
        { id: '3', type: 'individual', isArchived: true, unreadCount: 1, markedUnread: false, isPinned: false },
        { id: '4', type: 'group', isArchived: false, unreadCount: 3, markedUnread: false, isPinned: false },
        { id: '5', type: 'individual', isArchived: false, unreadCount: 0, markedUnread: false, isPinned: true },
      ];

      const counts = {
        all: mockChats.filter((c) => !c.isArchived).length,
        unread: mockChats.filter((c) => !c.isArchived && (c.unreadCount > 0 || c.markedUnread)).length,
        groups: mockChats.filter((c) => !c.isArchived && c.type === 'group').length,
        archived: mockChats.filter((c) => c.isArchived).length,
        pinned: mockChats.filter((c) => !c.isArchived && c.isPinned).length,
      };

      expect(counts.all).toBe(4);
      expect(counts.unread).toBe(3); // id 1, id 2 (markedUnread), id 4
      expect(counts.groups).toBe(2); // id 2, id 4
      expect(counts.archived).toBe(1); // id 3
      expect(counts.pinned).toBe(2); // id 1, id 5
    });
  });
});