import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/** Global so any module can inject EventsService without importing this module */
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}