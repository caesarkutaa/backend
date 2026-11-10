import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

export interface PaystackTransaction {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'reversed' | string;
  reference: string;
  amount: number; // kobo
  currency: string;
  channel: string;
  paid_at: string | null;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey?: string;
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('PAYSTACK_SECRET_KEY')?.trim() || undefined;
    this.http = axios.create({
      baseURL: 'https://api.paystack.co',
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /** Off when the key is missing or still the placeholder */
  isEnabled(): boolean {
    return !!this.secretKey && !this.secretKey.includes('xxx');
  }

  async initialize(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, any>;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }> {
    this.ensureEnabled();
    try {
      const { data } = await this.http.post('/transaction/initialize', {
        email: params.email,
        amount: params.amountKobo,
        reference: params.reference,
        callback_url: params.callbackUrl,
        currency: 'NGN',
        metadata: params.metadata,
      });
      return {
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        reference: data.data.reference,
      };
    } catch (error) {
      this.handleError(error, 'initialize');
    }
  }

  async verify(reference: string): Promise<PaystackTransaction> {
    this.ensureEnabled();
    try {
      const { data } = await this.http.get(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );
      return data.data as PaystackTransaction;
    } catch (error) {
      this.handleError(error, 'verify');
    }
  }

  /** Paystack signs webhooks with HMAC-SHA512 of the raw body using your secret key */
  isValidSignature(rawBody: Buffer, signature?: string): boolean {
    if (!this.secretKey || !signature) return false;
    const hash = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const expected = Buffer.from(hash);
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private ensureEnabled() {
    if (!this.isEnabled()) {
      throw new BadRequestException('Card payment is currently unavailable. Please use bank transfer.');
    }
  }

  private handleError(error: unknown, action: string): never {
    const message = axios.isAxiosError(error)
      ? (error.response?.data as any)?.message ?? error.message
      : String(error);
    this.logger.error(`Paystack ${action} failed: ${message}`);
    throw new BadGatewayException('Could not reach the payment provider. Please try again.');
  }
}