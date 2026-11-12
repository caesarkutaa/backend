import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { RevalidationService } from './revalidation.service';

/** Which storefront caches to refresh after a successful change */
const RULES: { prefix: string; tags: string[] }[] = [
  { prefix: '/api/perfumes', tags: ['perfumes'] },
  { prefix: '/api/brands', tags: ['brands', 'perfumes'] },
  { prefix: '/api/categories', tags: ['categories', 'perfumes'] },
  { prefix: '/api/settings', tags: ['settings'] },
  { prefix: '/api/reviews', tags: ['perfumes'] },
];

@Injectable()
export class RevalidationInterceptor implements NestInterceptor {
  constructor(private readonly revalidation: RevalidationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next.handle();

    const rule = RULES.find((r) => req.path.startsWith(r.prefix));
    if (!rule) return next.handle();

    return next.handle().pipe(tap(() => this.revalidation.revalidate(rule.tags)));
  }
}