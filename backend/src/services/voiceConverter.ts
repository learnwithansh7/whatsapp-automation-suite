import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export interface VoiceConversionResult {
  oggBuffer: Buffer;
  durationSeconds: number;
  waveform: Uint8Array;
}

/**
 * Generate a synthetic 64-point audio waveform based on buffer energy or fallback pattern.
 */
export function generateWaveform(buffer: Buffer): Uint8Array {
  const bars = 64;
  const waveform = new Uint8Array(bars);

  if (buffer.length < bars) {
    for (let i = 0; i < bars; i++) {
      waveform[i] = Math.floor(Math.sin((i / bars) * Math.PI) * 50) + 10;
    }
    return waveform;
  }

  const step = Math.floor(buffer.length / bars);
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const start = i * step;
    const end = Math.min(start + step, buffer.length);
    for (let j = start; j < end; j++) {
      sum += Math.abs(buffer[j] - 128);
    }
    const avg = sum / (end - start);
    // WhatsApp waveform values are typically 0..100
    waveform[i] = Math.min(100, Math.max(5, Math.floor((avg / 128) * 100)));
  }

  return waveform;
}

/**
 * Convert any browser voice audio buffer to WhatsApp standard OGG/Opus mono 16 kHz.
 */
export async function convertToWhatsAppVoiceNote(inputBuffer: Buffer): Promise<VoiceConversionResult> {
  const binary = ffmpegPath as unknown as string;
  if (!binary || !fs.existsSync(binary)) {
    throw new Error('ffmpeg-static binary is not available or executable');
  }

  const tmpId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `wa_voice_in_${tmpId}.tmp`);
  const outputPath = path.join(tmpDir, `wa_voice_out_${tmpId}.ogg`);

  try {
    // Write raw browser audio input
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Run ffmpeg: convert to OGG Opus mono 16kHz
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-vbr',
        'on',
        '-ar',
        '16000',
        '-ac',
        '1',
        outputPath,
      ];

      const proc = spawn(binary, args);

      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg voice conversion failed with exit code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });

    const oggBuffer = await fs.promises.readFile(outputPath);

    // Estimate duration using file size and 32kbps bitrate (or fallback)
    // 32kbps = 4000 bytes/sec
    const durationSeconds = Math.max(1, Math.round(oggBuffer.length / 4000));
    const waveform = generateWaveform(oggBuffer);

    return {
      oggBuffer,
      durationSeconds,
      waveform,
    };
  } finally {
    // Always clean up temporary files
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
}
