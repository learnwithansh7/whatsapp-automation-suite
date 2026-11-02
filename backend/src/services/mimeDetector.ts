import { env } from '../config/env.js';

export interface MimeValidationResult {
  valid: boolean;
  mimeType?: string;
  kind?: 'image' | 'video' | 'audio' | 'voice' | 'document';
  error?: string;
}

/**
 * Inspect magic bytes from buffer header to determine real MIME type.
 * Never trust user-provided extensions or Content-Type headers alone.
 */
export function detectMimeType(buffer: Buffer): { mimeType: string; kind: 'image' | 'video' | 'audio' | 'document' } | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // 1. Images
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', kind: 'image' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', kind: 'image' };
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mimeType: 'image/gif', kind: 'image' };
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', kind: 'image' };
  }

  // 2. Audio & Video
  // MP4 / M4A / MOV: ftyp box at offset 4
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand.includes('M4A') || brand.includes('m4a')) {
      return { mimeType: 'audio/mp4', kind: 'audio' };
    }
    return { mimeType: 'video/mp4', kind: 'video' };
  }

  // WebM / Matroska: 1A 45 DF A3
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    // Look ahead to check if audio or video in WebM header
    const headerStr = buffer.subarray(0, 64).toString('utf8');
    if (headerStr.includes('webm') || headerStr.includes('matroska')) {
      // Default to video/webm or audio/webm
      return { mimeType: 'audio/webm', kind: 'audio' };
    }
    return { mimeType: 'video/webm', kind: 'video' };
  }

  // OGG container (OggS): 4F 67 67 53
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return { mimeType: 'audio/ogg; codecs=opus', kind: 'audio' };
  }

  // MP3: ID3 or 0xFF 0xFB / 0xFF 0xF3
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { mimeType: 'audio/mpeg', kind: 'audio' };
  }

  // WAV: RIFF .... WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return { mimeType: 'audio/wav', kind: 'audio' };
  }

  // 3. Documents
  // PDF: %PDF (25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mimeType: 'application/pdf', kind: 'document' };
  }

  // ZIP / DOCX / XLSX: PK.. (50 4B 03 04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return { mimeType: 'application/zip', kind: 'document' };
  }

  // Plain Text / generic text document (all printable ascii or utf8)
  let isText = true;
  const sampleLen = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLen; i++) {
    const byte = buffer[i];
    // 0x09 tab, 0x0a lf, 0x0d cr, 0x20..0x7e printable
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      isText = false;
      break;
    }
  }

  if (isText) {
    return { mimeType: 'text/plain', kind: 'document' };
  }

  return null;
}

/**
 * Validate upload buffer against file size limits and real MIME type.
 */
export function validateUpload(
  buffer: Buffer,
  expectedCategory?: 'image' | 'video' | 'audio' | 'voice' | 'document',
): MimeValidationResult {
  const detected = detectMimeType(buffer);

  if (!detected) {
    return {
      valid: false,
      error: 'Unsupported or unidentifiable file format. File magic bytes do not match permitted types.',
    };
  }

  const kind = expectedCategory === 'voice' ? 'voice' : detected.kind;
  const sizeMb = buffer.length / (1024 * 1024);

  // Check Category-specific size limit
  switch (kind) {
    case 'image':
      if (sizeMb > env.MAX_IMAGE_SIZE_MB) {
        return {
          valid: false,
          error: `Image size (${sizeMb.toFixed(1)} MB) exceeds maximum allowed limit of ${env.MAX_IMAGE_SIZE_MB} MB`,
        };
      }
      break;
    case 'video':
      if (sizeMb > env.MAX_VIDEO_SIZE_MB) {
        return {
          valid: false,
          error: `Video size (${sizeMb.toFixed(1)} MB) exceeds maximum allowed limit of ${env.MAX_VIDEO_SIZE_MB} MB`,
        };
      }
      break;
    case 'audio':
    case 'voice':
      if (sizeMb > env.MAX_AUDIO_SIZE_MB) {
        return {
          valid: false,
          error: `Audio size (${sizeMb.toFixed(1)} MB) exceeds maximum allowed limit of ${env.MAX_AUDIO_SIZE_MB} MB`,
        };
      }
      break;
    case 'document':
      if (sizeMb > env.MAX_DOCUMENT_SIZE_MB) {
        return {
          valid: false,
          error: `Document size (${sizeMb.toFixed(1)} MB) exceeds maximum allowed limit of ${env.MAX_DOCUMENT_SIZE_MB} MB`,
        };
      }
      break;
  }

  return {
    valid: true,
    mimeType: detected.mimeType,
    kind,
  };
}
