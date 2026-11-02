import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export async function generateThumbnail(inputBuffer: Buffer, isVideo = false): Promise<string | null> {
  const binary = ffmpegPath as unknown as string;
  if (!binary || !fs.existsSync(binary)) {
    return null;
  }

  const tmpId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  const inputExt = isVideo ? '.mp4' : '.img';
  const inputPath = path.join(tmpDir, `wa_thumb_in_${tmpId}${inputExt}`);
  const outputPath = path.join(tmpDir, `wa_thumb_out_${tmpId}.jpg`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const args = isVideo
        ? [
            '-y',
            '-ss',
            '00:00:01',
            '-i',
            inputPath,
            '-vframes',
            '1',
            '-vf',
            'scale=128:-1',
            '-q:v',
            '5',
            outputPath,
          ]
        : [
            '-y',
            '-i',
            inputPath,
            '-vf',
            'scale=128:-1',
            '-q:v',
            '5',
            outputPath,
          ];

      const proc = spawn(binary, args);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Thumbnail generation failed with code ${code}`));
      });
      proc.on('error', reject);
    });

    const thumbBuffer = await fs.promises.readFile(outputPath);
    return `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
  } catch {
    return null;
  } finally {
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
}
