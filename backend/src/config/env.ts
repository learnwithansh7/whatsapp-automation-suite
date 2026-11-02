import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from .env file before schema validation
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string({
    required_error: 'DATABASE_URL is required (e.g. postgresql://user:password@localhost:5432/whatsapp_client?schema=public)',
  }).url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  ENCRYPTION_KEY: z.string({
    required_error: 'ENCRYPTION_KEY is required for AES-256-GCM token encryption',
  }).refine(
    (val) => {
      try {
        const buf = Buffer.from(val, 'base64');
        return buf.length === 32;
      } catch {
        return false;
      }
    },
    {
      message: 'ENCRYPTION_KEY must be a valid 32-byte base64 encoded string.',
    },
  ),
  JWT_SECRET: z.string().default('local_development_jwt_secret_placeholder_key_32bytes'),
  // Auth flag: when false, dashboard login is bypassed (Supabase auth will replace this in a later phase)
  AUTH_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  // Redis is optional in Phase 0/1 and will be added in Phase 3
  REDIS_URL: z.string().optional(),
  // Phase 3: Anti-Ban Send Queue & Rate Limits
  SEND_MIN_DELAY_MS: z.coerce.number().default(1500),
  SEND_MAX_DELAY_MS: z.coerce.number().default(3500),
  SEND_MAX_PER_MINUTE: z.coerce.number().default(20),
  SEND_MAX_PER_HOUR: z.coerce.number().default(300),
  // Phase 3: Media Upload & Download Limits (in MB)
  MAX_IMAGE_SIZE_MB: z.coerce.number().default(16),
  MAX_VIDEO_SIZE_MB: z.coerce.number().default(64),
  MAX_DOCUMENT_SIZE_MB: z.coerce.number().default(100),
  MAX_AUDIO_SIZE_MB: z.coerce.number().default(16),
  AUTO_DOWNLOAD_VIDEO_MAX_MB: z.coerce.number().default(25),
  // Phase 3: WhatsApp Read Receipts (default false - only local unread reset)
  SEND_READ_RECEIPTS: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => ` - [${issue.path.join('.')}] ${issue.message}`)
    .join('\n');

  console.error('\n========================================');
  console.error(' [FATAL] Environment Configuration Error');
  console.error('========================================');
  console.error(errors);
  console.error('\nPlease verify your backend/.env file matches .env.example.\n');
  process.exit(1);
}

const config = parsed.data;

// Safety check: Refuse to start if AUTH_ENABLED is false in production
if (!config.AUTH_ENABLED && config.NODE_ENV === 'production') {
  console.error('\n=============================================================');
  console.error(' [FATAL SECURITY ERROR] AUTH_ENABLED cannot be false in production');
  console.error('=============================================================\n');
  process.exit(1);
}

// Safety: When AUTH_ENABLED is false, force host to 127.0.0.1 only
if (!config.AUTH_ENABLED) {
  config.HOST = '127.0.0.1';
  console.warn('\n*************************************************************');
  console.warn(' [WARNING] AUTH DISABLED - local development only');
  console.warn(' Server is restricted to 127.0.0.1 loopback interface');
  console.warn('*************************************************************\n');
}

export const env = config;
export type Env = typeof env;
