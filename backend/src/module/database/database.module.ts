import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { FirestoreService } from './firestore/firestore.service';
import { PrismaUserRepository } from './prisma/prisma-user.repository';
import { PrismaAccountRepository } from './prisma/prisma-account.repository';
import { FirestoreUserRepository } from './firestore/firestore-user.repository';
import { FirestoreAccountRepository } from './firestore/firestore-account.repository';

export const USER_REPOSITORY = 'USER_REPOSITORY';
export const ACCOUNT_REPOSITORY = 'ACCOUNT_REPOSITORY';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: USER_REPOSITORY,
          useFactory: (config: ConfigService, prismaUser: PrismaUserRepository, firestoreUser: FirestoreUserRepository) => {
            return config.get('DATABASE_PROVIDER') === 'firebase' ? firestoreUser : prismaUser;
          },
          inject: [ConfigService, PrismaUserRepository, FirestoreUserRepository],
        },
        {
          provide: ACCOUNT_REPOSITORY,
          useFactory: (config: ConfigService, prismaAccount: PrismaAccountRepository, firestoreAccount: FirestoreAccountRepository) => {
            return config.get('DATABASE_PROVIDER') === 'firebase' ? firestoreAccount : prismaAccount;
          },
          inject: [ConfigService, PrismaAccountRepository, FirestoreAccountRepository],
        },
        FirestoreService,
        PrismaUserRepository,
        PrismaAccountRepository,
        FirestoreUserRepository,
        FirestoreAccountRepository,
      ],
      exports: [USER_REPOSITORY, ACCOUNT_REPOSITORY],
    };
  }
}
