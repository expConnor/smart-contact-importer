import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash, argon2id } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';

type SeedUser = { readonly email: string; readonly password: string };

const USERS: readonly SeedUser[] = [
  { email: 'user1@test.com', password: 'develop' },
  { email: 'user2@test.com', password: 'develop' },
  { email: 'user3@test.com', password: 'develop' },
];

// OWASP minimum for Argon2id: 19 MiB, 2 iterations, 1 lane.
const HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const user of USERS) {
      const passwordHash = await hash(user.password, HASH_OPTIONS);
      const now = new Date();

      await prisma.user.upsert({
        where: { email: user.email },
        update: { passwordHash, updatedAt: now },
        create: {
          id: randomUUID(),
          email: user.email,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });

      console.log(`seeded ${user.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
