import { Module } from '@nestjs/common';
import { TickTickController } from './ticktick.controller';
import { TickTickService } from './ticktick.service';

@Module({
  controllers: [TickTickController],
  providers: [TickTickService],
  exports: [TickTickService],
})
export class TickTickModule {}
