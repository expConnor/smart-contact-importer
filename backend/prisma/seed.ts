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

const CONTACT_COUNT = 200;

// Fixed epoch so createdAt — the default sort and cursor key — is stable
// across re-runs. Contact i is one hour older than contact i - 1.
const CONTACT_EPOCH = new Date('2026-01-01T00:00:00.000Z');

const FIRST_NAMES = [
  'Ada',
  'Bea',
  'Cyrus',
  'Dara',
  'Elias',
  'Farrah',
  'Gus',
  'Hana',
  'Ivo',
  'Jules',
  'Kai',
  'Lena',
  'Mateo',
  'Nadia',
  'Omar',
  'Pia',
  'Quinn',
  'Rosa',
  'Sven',
  'Tara',
] as const;

const LAST_NAMES = [
  'Abara',
  'Bellini',
  'Cho',
  'Dumas',
  'Eriksen',
  'Ferreira',
  'Grant',
  'Haddad',
  'Ionescu',
  'Jensen',
  'Kovac',
  'Lindqvist',
  'Moreau',
  'Nakamura',
  'Okafor',
  'Petrov',
  'Quintana',
  'Rossi',
  'Silva',
  'Takahashi',
] as const;

// Uneven bucket sizes keep the ?company= filter interesting: some pages are
// one company, some straddle several.
const COMPANIES = [
  'Northwind Freight',
  'Lumen Analytics',
  'Harbour & Stone',
  'Cobalt Robotics',
  'Verdant Foods',
  'Atlas Interiors',
  'Pinecrest Health',
  'Orbital Media',
  'Kestrel Legal',
  'Bright Anvil',
  'Silt & Sons',
  'Meridian Labs',
] as const;

const JOB_TITLES = [
  'Head of Operations',
  'Account Executive',
  'Procurement Lead',
  'Office Manager',
  'CTO',
  'Marketing Director',
  'Facilities Coordinator',
  'Finance Partner',
  'Sales Engineer',
  'Managing Director',
] as const;

const STATUSES = ['lead', 'active', 'dormant', 'bounced'] as const;

type SeedContact = {
  readonly email: string;
  readonly name: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phone: string;
  readonly status: string;
  readonly createdAt: Date;
};

// Strides are coprime with their pool lengths (and with each other) so the
// fields decorrelate instead of repeating in lockstep every 20 rows.
function buildContacts(count: number): readonly SeedContact[] {
  return Array.from({ length: count }, (_, i) => {
    const first = FIRST_NAMES[(i * 7) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 13) % LAST_NAMES.length];
    const company = COMPANIES[(i * 5) % COMPANIES.length];
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '');

    return {
      // Index in the local part: names collide by design, emails must not —
      // email is the unique key the importer dedupes on.
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${slug}.test`,
      name: `${first} ${last}`,
      company,
      jobTitle: JOB_TITLES[(i * 3) % JOB_TITLES.length],
      phone: `+1-555-${String(1000 + i).padStart(4, '0')}`,
      status: STATUSES[i % STATUSES.length],
      createdAt: new Date(CONTACT_EPOCH.getTime() - i * 3_600_000),
    };
  });
}

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

    // Upsert rather than createMany so re-running the seed refreshes rows
    // instead of half-failing on the unique email index.
    for (const contact of buildContacts(CONTACT_COUNT)) {
      await prisma.contact.upsert({
        where: { email: contact.email },
        update: {
          name: contact.name,
          company: contact.company,
          jobTitle: contact.jobTitle,
          phone: contact.phone,
          status: contact.status,
          createdAt: contact.createdAt,
          updatedAt: contact.createdAt,
        },
        create: {
          id: randomUUID(),
          ...contact,
          updatedAt: contact.createdAt,
        },
      });
    }

    console.log(`seeded ${CONTACT_COUNT} contacts`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
