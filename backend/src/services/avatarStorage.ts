import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export interface IAvatarStorage {
  saveAvatar(sessionId: string, jid: string, buffer: Buffer, extension?: string): Promise<string>;
  getAvatarPath(relativePath: string): string;
  getAvatarStream(relativePath: string): Promise<{ stream: Readable; contentType: string } | null>;
  avatarExists(relativePath: string): Promise<boolean>;
  deleteAvatar(relativePath: string): Promise<boolean>;
}

export class LocalDiskAvatarStorage implements IAvatarStorage {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(process.cwd(), 'storage', 'avatars');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Cleans a JID for safe filesystem storage.
   */
  private cleanJid(jid: string): string {
    return jid.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Save an avatar image buffer to disk under storage/avatars/{sessionId}/{jid}.{ext}.
   * Returns the relative path/key.
   */
  public async saveAvatar(
    sessionId: string,
    jid: string,
    buffer: Buffer,
    extension = 'jpg',
  ): Promise<string> {
    const sessionDir = path.join(this.baseDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const safeFilename = `${this.cleanJid(jid)}.${extension}`;
    const fullPath = path.join(sessionDir, safeFilename);

    await fs.promises.writeFile(fullPath, buffer);

    // Return portable relative path key
    return path.join(sessionId, safeFilename).replace(/\\/g, '/');
  }

  public getAvatarPath(relativePath: string): string {
    return path.resolve(this.baseDir, relativePath);
  }

  public async avatarExists(relativePath: string): Promise<boolean> {
    const fullPath = this.getAvatarPath(relativePath);
    return fs.existsSync(fullPath);
  }

  public async getAvatarStream(
    relativePath: string,
  ): Promise<{ stream: Readable; contentType: string } | null> {
    const fullPath = this.getAvatarPath(relativePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';

    const stream = fs.createReadStream(fullPath);
    return { stream, contentType };
  }

  public async deleteAvatar(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.getAvatarPath(relativePath);
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

export const avatarStorage: IAvatarStorage = new LocalDiskAvatarStorage();
