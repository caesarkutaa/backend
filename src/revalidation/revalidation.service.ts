import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);
  private readonly url?: string;
  private readonly secret?: string;

  constructor(config: ConfigService) {
    const base = (config.get<string>('FRONTEND_INTERNAL_URL') || config.get<string>('FRONTEND_URL') || '').replace(/\/+$/, '');
    this.secret = config.get<string>('REVALIDATE_SECRET')?.trim() || undefined;
    this.url = base && this.secret ? `${base}/internal/revalidate` : undefined;

    if (!this.url) this.logger.warn('REVALIDATE_SECRET not set — storefront updates after cache expiry only');
  }

  /** Fire-and-forget: never slows down or breaks the admin request */
  revalidate(tags: string[]) {
    if (!this.url || !tags.length) return;

    fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': this.secret! },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn(`Revalidate ${tags.join(',')} failed: HTTP ${res.status}`);
      })
      .catch((error) => this.logger.warn(`Revalidate ${tags.join(',')} failed: ${error?.message}`));
  }
}