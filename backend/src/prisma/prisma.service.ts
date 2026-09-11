import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

/**
 * The shape of the `log` option below, as a type.
 *
 * It has to be written twice — once here, once as the value in `super()` —
 * because of how the generated client is shaped. `PrismaClient` is a const
 * whose type is a constructor interface, and `extends PrismaClient` resolves
 * that interface's DEFAULT type arguments instead of inferring them from the
 * `super()` call. The default event union is `never`, so all three `$on` calls
 * below would be compile errors.
 *
 * The generic on the class is therefore the OPTIONS object, not the event
 * union. The exported `PrismaClient` *type* does take the union directly
 * (`PrismaClient<'query' | 'warn' | 'error'>`), but in `extends` position you
 * are parameterising the *constructor*, whose first parameter is
 * `Prisma.PrismaClientOptions`. Passing the union there fails with
 * "Type 'string' does not satisfy the constraint 'PrismaClientOptions'".
 */
type LogConfig = [
  { emit: 'event'; level: 'query' },
  { emit: 'event'; level: 'warn' },
  { emit: 'event'; level: 'error' },
];

@Injectable()
export class PrismaService
  extends PrismaClient<{ adapter: PrismaPg; log: LogConfig }>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // schema.prisma's datasource has no `url`: Prisma 7 takes the connection
    // string from the adapter, so this is the app's only source for it.
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
    });

    // `emit: 'event'` rather than a list of levels.
    //
    // A level list makes Prisma print through its OWN printer, straight to the
    // console, where no Nest log level and no `logger: false` can reach it.
    // That is why the e2e suite printed the P2002 that imports.service.ts
    // raises on purpose and then handles: two blocks per green run, for a code
    // path that is working. Emitting instead puts Prisma behind the same switch
    // as every other component in the app.
    //
    // The literal stays inline. Prisma infers the $on() event names from it,
    // and a helper returning Prisma.LogDefinition[] widens the type until
    // $on('query') stops type-checking.
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    // Gated on the environment rather than left to Logger.debug's own level:
    // main.ts does not configure Nest log levels, so debug prints in production
    // until it does, and a line per statement is not something to switch on
    // there by accident.
    //
    // duration is a float (15.744542000000024), so it is rounded. e.params
    // carries the bound values if a future reader wants them; it is left out
    // because those are row data.
    if (env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`${Math.round(e.duration)}ms ${e.query}`);
      });
    }

    this.$on('warn', (e) => this.logger.warn(e.message));
    this.$on('error', (e) => this.logger.error(e.message));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
