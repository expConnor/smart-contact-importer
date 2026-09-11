import { Controller, Get } from '@nestjs/common';
import { createTestApp } from '../../test/app.fixture';
import type { TestApp } from '../../test/app.fixture';
import type { ErrorBody } from './error-catalogue';

// Test-module only. Never add this to AppModule.
@Controller({ path: 'boom', version: '1' })
class BoomController {
  @Get()
  boom(): never {
    throw new Error('kaboom: users.passwordHash');
  }
}

describe('AppErrorFilter', () => {
  let ctx: TestApp;

  const anyString = expect.any(String) as unknown as string;

  // Was a hand-rolled testing module with its own Prisma stub and its own copy
  // of the main.ts globals. Both are gone: the stub because Postgres is no
  // longer doubled, the copy because a second mirror of main.ts is a second
  // thing to forget to update.
  beforeAll(async () => {
    ctx = await createTestApp({ controllers: [BoomController] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const http = () => ctx.http();

  it('routes validation failures through the envelope, not the default 400', async () => {
    const res = await http().post('/v1/auth/login').send({});
    const body = res.body as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.details).toEqual([
      { field: 'email', message: anyString },
      { field: 'password', message: anyString },
    ]);
  });

  // No row is seeded, so the lookup misses against the real, truncated table —
  // the same miss the stub used to fake with mockResolvedValueOnce(null).
  it('answers an unknown email with a 401 carrying nothing but code and message', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect((res.body as ErrorBody).error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
  });

  it('reduces an unknown throwable to a bare 500 that leaks nothing', async () => {
    const res = await http().get('/v1/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
