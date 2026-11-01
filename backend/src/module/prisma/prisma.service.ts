import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private configService: ConfigService) {
    super();
  }

  async onModuleInit() {
    const provider = this.configService.get<string>('DATABASE_PROVIDER', 'postgres');
    if (provider === 'postgres') {
      await this.$connect();
    } else {
      console.log('[PrismaService] Skipping Postgres connection (DATABASE_PROVIDER is not "postgres")');
    }
  }

  async onModuleDestroy() {
    const provider = this.configService.get<string>('DATABASE_PROVIDER', 'postgres');
    if (provider === 'postgres') {
      await this.$disconnect();
    }
  }
}
