import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';

/** Tighter limits on sensitive endpoints (per IP) */
const STRICT_RULES: { method: string; pattern: RegExp; limit: number; ttl: number }[] = [
  { method: 'POST', pattern: /^\/api\/auth\/login$/, limit: 10, ttl: 5 * 60_000 },
  { method: 'POST', pattern: /^\/api\/auth\/register$/, limit: 5, ttl: 15 * 60_000 },
  { method: 'POST', pattern: /^\/api\/auth\/forgot-password$/, limit: 5, ttl: 15 * 60_000 },
  { method: 'POST', pattern: /^\/api\/auth\/reset-password$/, limit: 10, ttl: 15 * 60_000 },
  { method: 'POST', pattern: /^\/api\/orders\/checkout$/, limit: 10, ttl: 10 * 60_000 },
  { method: 'POST', pattern: /^\/api\/orders\/[^/]+\/payment-proof$/, limit: 10, ttl: 10 * 60_000 },
];

/** Never throttled */
const SKIP = [/^\/api\/payments\/paystack\/webhook$/, /^\/api\/events\/stream$/];

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<Request>();

    // Page loads (GET) aren't limited — server-side rendering shares one IP
    if (req.method === 'GET' || SKIP.some((p) => p.test(req.path))) return true;

    const rule = STRICT_RULES.find((r) => r.method === req.method && r.pattern.test(req.path));
    return super.handleRequest(rule ? { ...props, limit: rule.limit, ttl: rule.ttl } : props);
  }

  /** Real client IP (requests arrive through the Next.js proxy) */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ips?.length ? req.ips[0] : req.ip;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Too many attempts. Please wait a few minutes and try again.');
  }
}