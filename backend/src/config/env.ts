import z from 'zod';

function parseOrExit(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  process.exit(1); // returns never, so no trailing return needed
}

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('432000'),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(2_000_000_000)
    .default(10_485_760),
  ANTHROPIC_API_KEY: z.string().optional(),
  WORKER_LEASE_SECONDS: z.coerce.number().int().positive().default(60),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_ENABLED: z.stringbool().default(true),
  WORKER_DEMO_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = Object.freeze(parseOrExit(process.env));
