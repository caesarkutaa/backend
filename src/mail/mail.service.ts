import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly replyTo?: string;
  readonly appName: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>('MAIL_FROM', 'Perfume Store <onboarding@resend.dev>');
    this.replyTo = config.get<string>('MAIL_REPLY_TO')?.trim() || undefined;
    this.appName = config.get<string>('APP_NAME', 'Perfume Store');

    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged, not sent');
    }
  }

  get isEnabled(): boolean {
    return !!this.resend;
  }

  /** Never throws — a failed email must never break an order or a request */
  async send(message: MailMessage): Promise<boolean> {
    const to = (Array.isArray(message.to) ? message.to : [message.to]).filter(Boolean);
    if (!to.length) return false;

    if (!this.resend) {
      this.logger.log(`[email not sent] "${message.subject}" → ${to.join(', ')}`);
      return false;
    }

    try {
      const replyTo = message.replyTo ?? this.replyTo;
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(replyTo ? { replyTo } : {}),
      });

      if (error) {
        this.logger.error(`Resend rejected "${message.subject}": ${error.message}`);
        return false;
      }
      return true;
    } catch (error: any) {
      this.logger.error(`Email "${message.subject}" failed: ${error?.message}`);
      return false;
    }
  }
}