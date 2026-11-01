import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FirestoreService } from './firestore/firestore.service';
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
          useClass: FirestoreUserRepository,
        },
        {
          provide: ACCOUNT_REPOSITORY,
          useClass: FirestoreAccountRepository,
        },
        FirestoreService,
        FirestoreUserRepository,
        FirestoreAccountRepository,
      ],
      exports: [USER_REPOSITORY, ACCOUNT_REPOSITORY],
    };
  }
}
