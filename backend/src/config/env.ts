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
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = Object.freeze(parseOrExit(process.env));
