import { Injectable, MessageEvent } from '@nestjs/common';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

export type OrderEventKind =
  | 'order.placed'
  | 'payment.proof_uploaded'
  | 'payment.confirmed'
  | 'payment.rejected'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.cancelled'
  | 'payment.mismatch'
  | 'payment.refund_required';

export interface AppEvent {
  type: 'order.updated' | 'account.blocked' | 'account.updated';
  /** What exactly happened (used by emails) */
  kind?: OrderEventKind;
  /** Deliver to this user */
  userId?: string;
  /** Also deliver to every connected admin */
  toAdmins?: boolean;
  /** Who caused it — their own browser won't show a duplicate toast */
  actorId?: string;
  orderId?: string;
  orderNumber?: string;
  paymentStatus?: string;
  orderStatus?: string;
  userMessage?: string;
  adminMessage?: string;
}

@Injectable()
export class EventsService {
  private readonly events$ = new Subject<AppEvent>();

  /** For server-side listeners (e.g. order emails) */
  readonly all$ = this.events$.asObservable();

  emit(event: AppEvent) {
    this.events$.next(event);
  }

  /** Live stream for one logged-in user (their own events + admin events if admin) */
  streamFor(user: AuthUser): Observable<MessageEvent> {
    const mine$ = this.events$.pipe(
      filter((e) => e.userId === user.id || (!!e.toAdmins && user.role === Role.ADMIN)),
      map((e) => ({ data: e })),
    );

    const heartbeat$ = interval(20_000).pipe(map(() => ({ data: { type: 'ping' } })));

    return merge(mine$, heartbeat$);
  }
}