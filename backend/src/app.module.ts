import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './module/prisma/prisma.module';
import { AuthModule } from './module/auth/auth.module';

@Module({
  // Buat module terpisah perfunction dan regis ke imports 
  imports: [
    // expandVariables lets .env values reference other vars, e.g. API="http://...:3030" → GOOGLE_CALLBACK_URL="${API}/auth/google/callback"
    ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
