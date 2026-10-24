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
  // Redis is optional in Phase 0 and will be added in Phase 3
  REDIS_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Format Zod errors into clear, actionable bullet points so the developer knows exactly what to fix
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
