import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';

const STORAGE_PREVIEWS_DIR = path.resolve(process.cwd(), 'storage', 'previews');
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Checks whether an IP address belongs to a private, loopback, or reserved network range.
 */
export function isPrivateIP(ip: string): boolean {
  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv6 checks
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // fc00::/7 (Unique local addresses)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // fe80::/10 (Link-local addresses)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true;
    }
    return false;
  }

  // IPv4 checks
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP
  }

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8 (Broadcast/Local)
  if (a === 0) return true;
  // 100.64.0.0/10 (Carrier grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  return false;
}

/**
 * Validates a target URL against SSRF attacks.
 * Verifies scheme is http/https, resolves hostname via DNS, and validates IP.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Protocol not allowed (only http and https are permitted)');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname string checks
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    throw new Error('Localhost and loopback access blocked (SSRF)');
  }

  // Resolve hostname via DNS
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    if (!lookupResults || lookupResults.length === 0) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }

    for (const res of lookupResults) {
      if (isPrivateIP(res.address)) {
        throw new Error(`SSRF blocked: IP ${res.address} is in private/internal range`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('SSRF blocked')) {
      throw err;
    }
    throw new Error(`DNS validation error: ${(err as Error).message}`);
  }

  return parsed;
}

/**
 * Extracts URLs from a given message text string.
 */
export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate and normalize
  return Array.from(new Set(matches.map((u) => u.trim())));
}

/**
 * Basic HTML entity decoder without external dependencies.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Extract OpenGraph and standard metadata from raw HTML.
 */
export function extractHtmlMetadata(html: string): {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
} {
  const result: { title?: string; description?: string; imageUrl?: string; siteName?: string } = {};

  // 1. og:title or <title>
  const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']og:title["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    result.title = decodeHtmlEntities(ogTitleMatch[1]);
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      result.title = decodeHtmlEntities(titleTagMatch[1]);
    }
  }

  // 2. og:description or standard description
  const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']og:description["']/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  if (ogDescMatch && ogDescMatch[1]) {
    result.description = decodeHtmlEntities(ogDescMatch[1]);
  }

  // 3. og:image
  const ogImgMatch = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']og:image["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i);
  if (ogImgMatch && ogImgMatch[1]) {
    result.imageUrl = ogImgMatch[1].trim();
  }

  // 4. og:site_name
  const ogSiteMatch = html.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']og:site_name["']/i);
  if (ogSiteMatch && ogSiteMatch[1]) {
    result.siteName = decodeHtmlEntities(ogSiteMatch[1]);
  }

  return result;
}

class LinkPreviewService {
  private lastFetchTime = 0;
  private minIntervalMs = 2000; // max 1 fetch per 2 seconds

  constructor() {
    this.ensureStorageDir().catch(console.error);
  }

  private async ensureStorageDir() {
    await fs.mkdir(STORAGE_PREVIEWS_DIR, { recursive: true });
  }

  /**
   * Fetches or retrieves cached link preview for a URL with SSRF protection.
   */
  public async getOrFetchPreview(rawUrl: string): Promise<{
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    imagePath: string | null;
    siteName: string | null;
    status: string;
  } | null> {
    const normalizedUrl = rawUrl.trim();

    // 1. Check cache (7 days TTL)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const existing = await prisma.linkPreview.findUnique({
      where: { url: normalizedUrl },
    });

    if (existing && existing.fetchedAt >= sevenDaysAgo && existing.status !== 'pending') {
      return existing;
    }

    // 2. Validate URL against SSRF
    let validUrl: URL;
    try {
      validUrl = await validateSafeUrl(normalizedUrl);
    } catch (err: unknown) {
      console.warn(`[LinkPreview] Blocked URL ${normalizedUrl}: ${(err as Error).message}`);
      await prisma.linkPreview.upsert({
        where: { url: normalizedUrl },
        create: {
          url: normalizedUrl,
          status: 'failed',
          fetchedAt: new Date(),
        },
        update: {
          status: 'failed',
          fetchedAt: new Date(),
        },
      });
      return null;
    }

    // 3. Enforce 2-second rate limit between fetches
    const now = Date.now();
    const timeSinceLast = now - this.lastFetchTime;
    if (timeSinceLast < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - timeSinceLast));
    }
    this.lastFetchTime = Date.now();

    // 4. Fetch page with 5s timeout, 1MB limit, max 3 redirects
    let html = '';
    let currentUrl = validUrl.toString();
    let redirectsCount = 0;

    try {
      while (redirectsCount <= 3) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WhatsAppClient/1.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        clearTimeout(timeoutId);

        // Check for redirect
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) break;

          const nextUrl = new URL(location, currentUrl).toString();
          // Validate redirect URL against SSRF
          await validateSafeUrl(nextUrl);
          currentUrl = nextUrl;
          redirectsCount++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('xml')) {
          // Not HTML, skip body
          break;
        }

        // Read stream up to 1 MB limit
        const reader = response.body?.getReader();
        if (!reader) break;

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        const maxBytes = 1024 * 1024; // 1 MB

        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          totalBytes += value.length;
          if (totalBytes >= maxBytes) {
            reader.cancel();
            break;
          }
        }

        const buffer = Buffer.concat(chunks);
        html = buffer.toString('utf-8');
        break;
      }
    } catch (fetchErr: unknown) {
      console.warn(`[LinkPreview] Fetch failed for ${normalizedUrl}: ${(fetchErr as Error).message}`);
      return await prisma.linkPreview.upsert({
        where: { url: normalizedUrl },
        create: {
          url: normalizedUrl,
          status: 'failed',
          fetchedAt: new Date(),
        },
        update: {
          status: 'failed',
          fetchedAt: new Date(),
        },
      });
    }

    if (!html) {
      return await prisma.linkPreview.upsert({
        where: { url: normalizedUrl },
        create: {
          url: normalizedUrl,
          status: 'empty',
          fetchedAt: new Date(),
        },
        update: {
          status: 'empty',
          fetchedAt: new Date(),
        },
      });
    }

    // 5. Parse metadata
    const meta = extractHtmlMetadata(html);
    const domainSiteName = meta.siteName || validUrl.hostname;

    // 6. Download image thumbnail if present
    let downloadedImagePath: string | null = null;
    let finalImageUrl = meta.imageUrl || null;

    if (finalImageUrl) {
      // Normalize relative image URLs
      try {
        finalImageUrl = new URL(finalImageUrl, currentUrl).toString();
        // Validate image URL against SSRF
        await validateSafeUrl(finalImageUrl);
        downloadedImagePath = await this.downloadPreviewImage(finalImageUrl);
      } catch (imgErr) {
        console.warn(`[LinkPreview] Image download skipped for ${finalImageUrl}:`, (imgErr as Error).message);
      }
    }

    const saved = await prisma.linkPreview.upsert({
      where: { url: normalizedUrl },
      create: {
        url: normalizedUrl,
        title: meta.title || null,
        description: meta.description || null,
        imageUrl: finalImageUrl,
        imagePath: downloadedImagePath,
        siteName: domainSiteName,
        status: meta.title ? 'ok' : 'empty',
        fetchedAt: new Date(),
      },
      update: {
        title: meta.title || null,
        description: meta.description || null,
        imageUrl: finalImageUrl,
        imagePath: downloadedImagePath,
        siteName: domainSiteName,
        status: meta.title ? 'ok' : 'empty',
        fetchedAt: new Date(),
      },
    });

    return saved;
  }

  /**
   * Downloads a preview image to disk (max 2MB) and returns relative file path.
   */
  private async downloadPreviewImage(imageUrl: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WhatsAppClient/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      let ext = 'jpg';
      if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('gif')) ext = 'gif';

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 2 * 1024 * 1024) return null; // Reject > 2MB

      const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
      const filename = `${hash}.${ext}`;
      const filePath = path.join(STORAGE_PREVIEWS_DIR, filename);

      await fs.writeFile(filePath, buffer);
      return filename;
    } catch {
      return null;
    }
  }

  public getStorageDirectory(): string {
    return STORAGE_PREVIEWS_DIR;
  }
}

export const linkPreviewService = new LinkPreviewService();
