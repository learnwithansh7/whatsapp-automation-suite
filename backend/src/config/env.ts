import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from .env file before schema validation
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
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
      message: 'ENCRYPTION_KEY must be a valid 32-byte base64 encoded string. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    },
  ),
  JWT_SECRET: z.string({
    required_error: 'JWT_SECRET is required for authenticating session cookies',
  }).min(16, 'JWT_SECRET must be at least 16 characters long'),
  // Redis is optional in Phase 0/1 and will be added in Phase 3
  REDIS_URL: z.string().optional(),
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

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
