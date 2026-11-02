import { describe, it, expect } from 'vitest';
import { detectMimeType, validateUpload } from '../../services/mimeDetector.js';

describe('MIME & Magic Bytes Detection (Phase 3)', () => {
  it('detects JPEG magic bytes (FF D8 FF)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'image/jpeg', kind: 'image' });
  });

  it('detects PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'image/png', kind: 'image' });
  });

  it('detects GIF89a header', () => {
    const buf = Buffer.from('GIF89a...', 'ascii');
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'image/gif', kind: 'image' });
  });

  it('detects WebP RIFF header', () => {
    // RIFF [4 bytes] WEBP
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
    ]);
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'image/webp', kind: 'image' });
  });

  it('detects MP4 video header (ftyp)', () => {
    const buf = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypisom'),
    ]);
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'video/mp4', kind: 'video' });
  });

  it('detects OGG audio container (OggS)', () => {
    const buf = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'audio/ogg; codecs=opus', kind: 'audio' });
  });

  it('detects PDF document (%PDF)', () => {
    const buf = Buffer.from('%PDF-1.4 file content', 'utf8');
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'application/pdf', kind: 'document' });
  });

  it('detects plain text documents', () => {
    const buf = Buffer.from('Hello world! Clean Light WhatsApp notes.', 'utf8');
    const detected = detectMimeType(buf);
    expect(detected).toEqual({ mimeType: 'text/plain', kind: 'document' });
  });

  it('rejects binary files with unknown magic bytes', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const detected = detectMimeType(buf);
    expect(detected).toBeNull();
  });
});

describe('Upload Validation & Size Limits', () => {
  it('validates a normal JPEG within 16MB limit', () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(1024 * 50), // 50 KB
    ]);
    const res = validateUpload(buf, 'image');
    expect(res.valid).toBe(true);
    expect(res.kind).toBe('image');
  });

  it('rejects an image exceeding MAX_IMAGE_SIZE_MB', () => {
    const fakeHugeBuf = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(17 * 1024 * 1024), // 17 MB > 16 MB limit
    ]);
    const res = validateUpload(fakeHugeBuf, 'image');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds maximum allowed limit');
  });
});
