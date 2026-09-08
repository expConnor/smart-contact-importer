import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createTestApp, findCookie, setCookies } from './app.fixture';
import type { TestApp } from './app.fixture';
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

  it('routes PrismaService to the mock instead of Postgres', async () => {
    ctx.prisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(ctx.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'nobody@example.com' },
    });
    expect(res.status).toBe(401);
  });

  it('normalises a missing set-cookie header to an empty list', async () => {
    const res = await ctx.http().get('/v1/probe/bake');

    expect(setCookies(res)).toEqual([]);
    expect(findCookie(res, 'access_token')).toBeUndefined();
  });
});
