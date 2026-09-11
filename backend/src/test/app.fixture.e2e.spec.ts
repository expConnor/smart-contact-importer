import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { COOKIE_NAME } from '../auth/cookie';
import { TokenService } from '../auth/token.service';
import { createTestApp, findCookie, setCookies } from './app.fixture';
import type { TestApp } from './app.fixture';
import { testDb } from './db.fixture';
import type { ErrorBody } from '../common/errors/error-catalogue';

// Test-module only. Never add this to AppModule.
@Controller({ path: 'probe', version: '1' })
class ProbeController {
  @Get('cookies')
  cookies(@Req() req: Request): Record<string, string> {
    return (req.cookies ?? {}) as Record<string, string>;
  }

  @Get('bake')
  bake(): { ok: true } {
    return { ok: true };
  }
}

describe('createTestApp', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('wires URI versioning, the validation pipe and the error filter', async () => {
    const res = await ctx.http().post('/v1/auth/login').send({});

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
  });

  it('wires cookie-parser, so guards can read req.cookies', async () => {
    const res = await ctx
      .http()
      .get('/v1/probe/cookies')
      .set('Cookie', 'access_token=abc123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: 'abc123' });
  });

  // The seam this whole phase turns on: the app under test and the suite must
  // be looking at the same database. Written through db.fixture's client, read
  // back over HTTP through the app's PrismaService — a double in between would
  // pass this while connecting to nothing.
  it('points the app at the test database the suite writes to', async () => {
    const id = '00000000-0000-4000-8000-0000000000f1';
    const email = 'fixture@test.com';

    // /me verifies a signature and reads a row; it never touches the hash, so
    // this is a placeholder rather than an argon2 digest (that cost belongs to
    // the one real login test).
    //
    // Written out longhand rather than through auth.fixture's seedUser, which
    // shares the placeholder literal: this test exists to prove the app and the
    // suite share a database, and routing it through a fixture that depends on
    // that seam would be testing the seam through itself.
    await testDb().user.create({
      data: { id, email, passwordHash: 'never-verified-on-this-path' },
    });

    const { token } = ctx.app.get(TokenService).sign(id);
    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, email });
  });

  // The other half of the same seam: the row the previous test wrote is gone,
  // so the TRUNCATE in setup-e2e.ts is reaching this app's database too.
  //
  // Named for the one transition it actually witnesses, not for "every test" —
  // run on its own with -t, the table is empty for reasons that have nothing to
  // do with the TRUNCATE and this passes green either way.
  //
  // Row count first: a dirty table reported as "expected 401, got 200" reads as
  // a broken guard, which is the wrong place to start looking.
  it("loses the previous test's row to the TRUNCATE", async () => {
    await expect(testDb().user.count()).resolves.toBe(0);

    const { token } = ctx.app
      .get(TokenService)
      .sign('00000000-0000-4000-8000-0000000000f1');

    const res = await ctx
      .http()
      .get('/v1/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(401);
  });

  it('normalises a missing set-cookie header to an empty list', async () => {
    const res = await ctx.http().get('/v1/probe/bake');

    expect(setCookies(res)).toEqual([]);
    expect(findCookie(res, 'access_token')).toBeUndefined();
  });
});
