import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

function logLevels(nodeEnv: typeof env.NODE_ENV): Prisma.LogLevel[] {
  switch (nodeEnv) {
    case 'development':
      return ['query', 'warn', 'error'];
    case 'test':
      return ['warn', 'error'];
    case 'production':
      return ['error'];
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // schema.prisma's datasource has no `url`: Prisma 7 takes the connection
    // string from the adapter, so this is the app's only source for it.
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
    });

    super({
      adapter,
      log: logLevels(env.NODE_ENV),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
