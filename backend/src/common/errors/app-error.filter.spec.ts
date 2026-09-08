import {
  Controller,
  Get,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { VALIDATION_PIPE_OPTIONS } from './validation.options';
import type { ErrorBody } from './error-catalogue';
import type { App } from 'supertest/types';
import { Public } from '../../auth/decorators/public.decorator';

// Test-module only. Never add this to AppModule.
@Public()
@Controller({ path: 'boom', version: '1' })
class BoomController {
  @Get()
  boom(): never {
    throw new Error('kaboom: users.passwordHash');
  }
}

describe('AppErrorFilter', () => {
  let app: INestApplication;
  const findUnique = jest.fn();

  const anyString = expect.any(String) as unknown as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique } })
      .compile();

    // logger: false — the filter warns on every branch; otherwise the run is noise.
    app = moduleRef.createNestApplication({ logger: false });
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer() as App);

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

  it('answers an unknown email with a 401 carrying nothing but code and message', async () => {
    findUnique.mockResolvedValueOnce(null);

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
