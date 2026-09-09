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
// across re-runs. Newest contact sits at the epoch, the rest walk back 21h
// per row, so all 200 land inside the last ~6 months (oldest ≈ 2026-03-11).
const CONTACT_EPOCH = new Date('2026-09-01T09:00:00.000Z');
const CONTACT_STEP_MS = 21 * 3_600_000;

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
  'Fenwick Textiles',
  'Copperline Energy',
  'Sable & Roe',
  'Tidewater Logistics',
  'Juniper Dental',
  'Ironbark Construction',
  'Halcyon Travel',
  'Vantage Credit Union',
] as const;

// Row counts per company, positionally aligned with COMPANIES and summing to
// CONTACT_COUNT. Uneven on purpose: the head companies overflow a single page
// so ?company= exercises pagination, the tail fits in one.
const COMPANY_WEIGHTS = [
  30, 22, 18, 15, 13, 12, 11, 10, 9, 8, 8, 7, 6, 6, 5, 5, 4, 4, 4, 3,
] as const;

const COMPANY_POOL: readonly string[] = COMPANIES.flatMap((company, index) =>
  Array.from({ length: COMPANY_WEIGHTS[index] }, () => company),
);

// 21 titles, not 20: a pool length coprime with the 20-name cycle keeps job
// title from becoming a fixed function of the person's name.
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
  'VP Engineering',
  'Customer Success Manager',
  'Data Analyst',
  'HR Business Partner',
  'Supply Chain Manager',
  'Product Manager',
  'Regional Sales Director',
  'Executive Assistant',
  'Compliance Officer',
  'Founder',
  'Site Reliability Engineer',
] as const;

// Weighted and 7 long: skews toward lead/active like a real book of contacts,
// and its period shares no factor with the name or title cycles.
const STATUS_POOL = [
  'lead',
  'active',
  'active',
  'lead',
  'dormant',
  'active',
  'bounced',
] as const;

type SeedContact = {
  readonly email: string;
  readonly name: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phone: string;
  readonly status: string;
  readonly createdAt: Date;
};

// Pool lengths (20 names, 21 titles, 7 statuses, 200 company slots) and their
// strides are pairwise coprime, so the fields decorrelate instead of repeating
// in lockstep every 20 rows.
function buildContacts(count: number): readonly SeedContact[] {
  return Array.from({ length: count }, (_, i) => {
    // Latin square: the first name cycles every 20 rows and the last name
    // shifts one place per block, so all 200 pairs are distinct.
    const block = Math.floor(i / FIRST_NAMES.length);
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i + block) % LAST_NAMES.length];
    const company = COMPANY_POOL[(i * 7) % COMPANY_POOL.length];
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '');

    return {
      // Index in the local part: email is the unique key the importer dedupes
      // on, so it stays collision-proof even if the name pools grow.
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${slug}.test`,
      name: `${first} ${last}`,
      company,
      jobTitle: JOB_TITLES[(i * 11) % JOB_TITLES.length],
      phone: `+49${block}${Math.floor(Math.random() * 100000)}${String(1000 + i).padStart(4, '0')}`,
      status: STATUS_POOL[i % STATUS_POOL.length],
      // Sub-step jitter varies the time of day; it is smaller than the step,
      // so createdAt stays strictly descending and safe as a cursor.
      createdAt: new Date(
        CONTACT_EPOCH.getTime() -
          i * CONTACT_STEP_MS -
          ((i * 37) % 120) * 60_000,
      ),
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
