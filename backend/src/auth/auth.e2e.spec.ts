import { JwtService } from '@nestjs/jwt';
import { COOKIE_NAME } from './cookie';
import { createTestApp, findCookie, setCookies } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { testDb } from '../test/db.fixture';
import {
  cookieFor,
  passwordHash,
  seedUser,
  TEST_PASSWORD,
} from '../test/auth.fixture';
import type { User } from '../generated/prisma/client';

// One app for the file, not one per describe. The three describes previously
// booted three, which only made sense while they shared a module-level Prisma
// double that had to be reset between them. Against the real database they
// share a truncated table instead, and the table is emptied per test.
let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('POST /v1/auth/login', () => {
  // The only describe in the suite that logs in for real, so the only one that
  // needs a verifiable digest. Everything else mints a cookie via cookieFor.
  let user: User;

  beforeAll(async () => {
    // The file's single argon2 hash, warmed here so it is not billed to
    // whichever test happens to run first. seedUser below hits the memo.
    await passwordHash(TEST_PASSWORD);
  });

  // beforeEach, not beforeAll: setup-e2e.ts TRUNCATEs before every test and
  // runs first, so a row seeded in beforeAll would be gone by test one.
  beforeEach(async () => {
    user = await seedUser({ password: TEST_PASSWORD });
  });

  it('issues an httpOnly cookie and returns the user without the token', async () => {
    const res = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // Exact match: proves passwordHash and token are both absent from the body.
    expect(res.body).toEqual({ id: user.id, email: user.email });

    const cookie = findCookie(res, COOKIE_NAME);
    expect(cookie).toBeDefined();
    // These three are the attributes logout has to repeat to evict this cookie
    // — see 'clears the cookie with the attributes login set' below.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejects a wrong password with 401 and sets no cookie', async () => {
    const res = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });

  it('answers an unknown email byte-identically to a wrong password', async () => {
    const wrongPassword = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'not-the-password' });

    // Not seeded, and the table holds exactly the one row above.
    const unknownEmail = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.text).toBe(wrongPassword.text);
    expect(setCookies(unknownEmail)).toEqual([]);
  });
});

describe('GET /v1/me', () => {
  it('rejects a request with no cookie', async () => {
    const res = await ctx.http().get('/v1/me');

    expect(res.status).toBe(401);
  });

  it('returns the user the cookie identifies', async () => {
    // Two rows, one cookie. A handler that returned "the user" by reading the
    // first row rather than the subject would pass with one row seeded.
    const user = await seedUser();
    await seedUser();

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', cookieFor(ctx, user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: user.email });
  });

  it('rejects a token signed with another secret', async () => {
    // Seeded on purpose: the row the forged token names exists, so a 200 here
    // would be the guard letting the signature through, not a lucky lookup miss.
    const user = await seedUser();

    const forged = new JwtService({ secret: 'not-the-app-secret' }).sign(
      {},
      { subject: user.id },
    );

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', `${COOKIE_NAME}=${forged}`);

    expect(res.status).toBe(401);
  });

  it('rejects a valid token whose user row is gone', async () => {
    const user = await seedUser();
    const cookie = cookieFor(ctx, user.id);

    // Establish the cookie is good BEFORE deleting, or a broken cookieFor would
    // make this test pass on the 401 it was already going to get.
    await expect(
      ctx.http().get('/v1/me').set('Cookie', cookie),
    ).resolves.toMatchObject({ status: 200 });

    // The transition itself: the session outlives the row it names.
    await testDb().user.delete({ where: { id: user.id } });

    const res = await ctx.http().get('/v1/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  it('clears the cookie with the attributes login set', async () => {
    // No cookie sent and no user seeded: logout is unguarded and never reads
    // the request (auth.controller.ts), so arranging either would imply a
    // precondition that does not exist. The next test pins that fact.
    const res = await ctx.http().post('/v1/auth/logout');

    expect(res.status).toBe(204);

    const cleared = findCookie(res, COOKIE_NAME);
    // The past expiry is what makes the browser evict. Without it this is an
    // empty session cookie the browser keeps sending until the tab closes.
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    // Eviction needs an exact name+domain+path match with the login cookie.
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('SameSite=Lax');
  });

  it('answers 204 when no cookie is sent at all', async () => {
    // Nothing guards logout, so a dead session can still clear its cookie.
    const res = await ctx.http().post('/v1/auth/logout');

    expect(res.status).toBe(204);
  });

  it('leaves behind a cookie that no longer authenticates', async () => {
    const user = await seedUser();

    const logout = await ctx
      .http()
      .post('/v1/auth/logout')
      .set('Cookie', cookieFor(ctx, user.id));

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', findCookie(logout, COOKIE_NAME) as string);

    expect(res.status).toBe(401);
    // The row is still there — this 401 is the emptied cookie failing the
    // guard, not /v1/me missing a user.
    await expect(testDb().user.count()).resolves.toBe(1);
  });
});
