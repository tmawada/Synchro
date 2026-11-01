import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './module/database/database.module';
import { AuthModule } from './module/auth/auth.module';
import { TickTickModule } from './module/ticktick/ticktick.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
    DatabaseModule.forRoot(),
    AuthModule,
    TickTickModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
