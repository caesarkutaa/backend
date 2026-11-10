import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { PaystackService } from '../payments/paystack.service';

/**
 * Public endpoint Paystack calls: POST /api/payments/paystack/webhook
 * Set this URL in Paystack Dashboard -> Settings -> API Keys & Webhooks.
 */
@Controller('payments/paystack')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly paystack: PaystackService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    if (!req.rawBody || !this.paystack.isValidSignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const event = req.body as { event?: string; data?: { reference?: string } };

    if (event?.event === 'charge.success' && event.data?.reference) {
      try {
        await this.ordersService.processPaystackReference(event.data.reference, 'webhook');
      } catch (error: any) {
        // Still return 200 so Paystack doesn't hammer us; the expiry job re-checks later
        this.logger.error(`Webhook processing failed: ${error?.message}`);
      }
    }

    return { received: true };
  }
}