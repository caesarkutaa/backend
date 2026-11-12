import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** GET /api/events/stream — authenticated via the httpOnly cookie */
  @Sse('stream')
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.events.streamFor(user);
  }
}