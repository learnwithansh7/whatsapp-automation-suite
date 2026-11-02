import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

export interface IMediaStorage {
  saveMedia(
    sessionId: string,
    buffer: Buffer,
    originalFilename?: string,
    mimeType?: string,
  ): Promise<{ relativePath: string; size: number; fileName: string }>;
  getMediaPath(relativePath: string): string;
  getMediaStream(
    relativePath: string,
  ): Promise<{ stream: Readable; contentType: string; size: number } | null>;
  mediaExists(relativePath: string): Promise<boolean>;
  deleteMedia(relativePath: string): Promise<boolean>;
}

export class LocalDiskMediaStorage implements IMediaStorage {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(process.cwd(), 'storage', 'media');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Derive safe file extension from mimeType or originalFilename.
   */
  private getSafeExtension(originalFilename?: string, mimeType?: string): string {
    if (mimeType) {
      const lower = mimeType.toLowerCase();
      if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
      if (lower.includes('png')) return '.png';
      if (lower.includes('webp')) return '.webp';
      if (lower.includes('gif')) return '.gif';
      if (lower.includes('mp4')) return '.mp4';
      if (lower.includes('ogg') || lower.includes('opus')) return '.ogg';
      if (lower.includes('mp3') || lower.includes('mpeg')) return '.mp3';
      if (lower.includes('pdf')) return '.pdf';
      if (lower.includes('plain')) return '.txt';
      if (lower.includes('zip')) return '.zip';
    }

    if (originalFilename) {
      const ext = path.extname(originalFilename).toLowerCase();
      if (/^\.[a-z0-9]{1,10}$/i.test(ext)) {
        return ext;
      }
    }

    return '.bin';
  }

  /**
   * Store binary media buffer under storage/media/{sessionId}/{uuid}{ext}.
   */
  public async saveMedia(
    sessionId: string,
    buffer: Buffer,
    originalFilename?: string,
    mimeType?: string,
  ): Promise<{ relativePath: string; size: number; fileName: string }> {
    const sessionDir = path.join(this.baseDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const ext = this.getSafeExtension(originalFilename, mimeType);
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(sessionDir, uniqueName);

    await fs.promises.writeFile(fullPath, buffer);

    const relativePath = path.join(sessionId, uniqueName).replace(/\\/g, '/');
    const safeDisplayFileName = originalFilename
      ? path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')
      : uniqueName;

    return {
      relativePath,
      size: buffer.length,
      fileName: safeDisplayFileName,
    };
  }

  public getMediaPath(relativePath: string): string {
    return path.resolve(this.baseDir, relativePath);
  }

  public async mediaExists(relativePath: string): Promise<boolean> {
    const fullPath = this.getMediaPath(relativePath);
    return fs.existsSync(fullPath);
  }

  public async getMediaStream(
    relativePath: string,
  ): Promise<{ stream: Readable; contentType: string; size: number } | null> {
    const fullPath = this.getMediaPath(relativePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const stat = await fs.promises.stat(fullPath);
    const ext = path.extname(fullPath).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.ogg') contentType = 'audio/ogg; codecs=opus';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.txt') contentType = 'text/plain';
    else if (ext === '.zip') contentType = 'application/zip';

    const stream = fs.createReadStream(fullPath);
    return { stream, contentType, size: stat.size };
  }

  public async deleteMedia(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.getMediaPath(relativePath);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const mediaStorage: IMediaStorage = new LocalDiskMediaStorage();
