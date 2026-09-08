import { JwtService } from '@nestjs/jwt';
import { argon2id, hash } from 'argon2';
import { COOKIE_NAME } from './cookie';
import { createTestApp, findCookie, setCookies } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';

// Must match prisma/seed.ts HASH_OPTIONS — argon2.verify reads the params off
// the digest, so a mismatch here tests a hash the seed would never produce.
const HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const PASSWORD = 'develop';

const SEEDED = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user1@test.com',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('POST /v1/auth/login', () => {
  let ctx: TestApp;
  let user: typeof SEEDED & { passwordHash: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = { ...SEEDED, passwordHash: await hash(PASSWORD, HASH_OPTIONS) };
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    ctx.prisma.user.findUnique.mockReset();
  });

  it('issues an httpOnly cookie and returns the user without the token', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);

    const res = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: PASSWORD });

    expect(res.status).toBe(200);
    // Exact match: proves passwordHash and token are both absent from the body.
    expect(res.body).toEqual({ id: SEEDED.id, email: SEEDED.email });

    const cookie = findCookie(res, COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
  });

  it('rejects a wrong password with 401 and sets no cookie', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);

    const res = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });

  it('answers an unknown email byte-identically to a wrong password', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);
    const wrongPassword = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: 'not-the-password' });

    ctx.prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknownEmail = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.com', password: PASSWORD });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.text).toBe(wrongPassword.text);
    expect(setCookies(unknownEmail)).toEqual([]);
  });
});

describe('GET /v1/me', () => {
  let ctx: TestApp;
  let user: typeof SEEDED & { passwordHash: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = { ...SEEDED, passwordHash: await hash(PASSWORD, HASH_OPTIONS) };
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    ctx.prisma.user.findUnique.mockReset();
  });

  it('rejects a request with no cookie', async () => {
    const res = await ctx.http().get('/v1/me');

    expect(res.status).toBe(401);
  });

  it('returns the user the cookie identifies', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user); // login
    const login = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: PASSWORD });

    const cookie = findCookie(login, COOKIE_NAME);
    expect(cookie).toBeDefined();

    ctx.prisma.user.findUnique.mockResolvedValueOnce(user); // /me
    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', cookie as string);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: SEEDED.id, email: SEEDED.email });
    expect(ctx.prisma.user.findUnique).toHaveBeenLastCalledWith({
      where: { id: SEEDED.id },
    });
  });

  it('rejects a token signed with another secret', async () => {
    const forged = new JwtService({ secret: 'not-the-app-secret' }).sign(
      {},
      { subject: SEEDED.id },
    );

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', `${COOKIE_NAME}=${forged}`);

    expect(res.status).toBe(401);
    expect(ctx.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose user row is gone', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user); // login
    const login = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: PASSWORD });

    ctx.prisma.user.findUnique.mockResolvedValueOnce(null); // /me - row deleted
    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', findCookie(login, COOKIE_NAME) as string);

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  let ctx: TestApp;
  let user: typeof SEEDED & { passwordHash: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = { ...SEEDED, passwordHash: await hash(PASSWORD, HASH_OPTIONS) };
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    ctx.prisma.user.findUnique.mockReset();
  });

  it('clears the cookie with the attributes login set', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);
    const login = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: PASSWORD });

    const res = await ctx
      .http()
      .post('/v1/auth/logout')
      .set('Cookie', findCookie(login, COOKIE_NAME) as string);

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
    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);
    const login = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: SEEDED.email, password: PASSWORD });

    const logout = await ctx
      .http()
      .post('/v1/auth/logout')
      .set('Cookie', findCookie(login, COOKIE_NAME) as string);

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', findCookie(logout, COOKIE_NAME) as string);

    expect(res.status).toBe(401);
    // Rejected in the guard - the controller never ran.
    expect(ctx.prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
