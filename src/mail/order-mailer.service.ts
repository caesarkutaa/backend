import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { filter, Subscription } from 'rxjs';
import { AppEvent, EventsService } from '../events/events.service';
import { MailService } from './mail.service';
import { Order } from '../orders/schemas/order.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { PaymentMethod, PaymentStatus } from '../common/enums/order.enum';
import * as T from './templates';

@Injectable()
export class OrderMailerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderMailerService.name);
  private subscription?: Subscription;
  private readonly frontendUrl: string;
  private readonly adminEmailsFromEnv: string[];

  constructor(
    private readonly events: EventsService,
    private readonly mail: MailService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/+$/, '');
    this.adminEmailsFromEnv = (config.get<string>('ADMIN_NOTIFY_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  onModuleInit() {
    this.subscription = this.events.all$
      .pipe(filter((e) => e.type === 'order.updated' && !!e.kind && !!e.orderId))
      .subscribe((event) => {
        // Fire-and-forget: emails never block or break the order flow
        this.handle(event).catch((err) =>
          this.logger.error(`Order email failed (${event.kind} ${event.orderNumber}): ${err?.message}`),
        );
      });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  private async handle(event: AppEvent) {
    const doc = await this.orderModel.findById(event.orderId).populate('user', 'name email').lean().exec();
    if (!doc) return;

    const order = doc as unknown as T.MailOrder & {
      _id: unknown;
      paymentProofs?: T.MailProof[];
      user: ({ _id: unknown } & T.MailCustomer) | null;
    };
    const customer = order.user;
    const customerId = customer ? String(customer._id) : undefined;
    const byCustomer = !!event.actorId && event.actorId === customerId;
    const bySystem = !event.actorId;

    const id = String(order._id);
    const links = {
      order: `${this.frontendUrl}/orders/${id}`,
      payment: `${this.frontendUrl}/orders/${id}/payment`,
      admin: `${this.frontendUrl}/admin/orders/${id}`,
    };
    const app = this.mail.appName;
    const n = order.orderNumber;

    const toCustomer = async (email: T.Email) => {
      if (customer?.email) await this.mail.send({ to: customer.email, ...email });
    };

    switch (event.kind) {
      case 'order.placed':
        await this.toAdmins(T.adminNewOrderEmail(app, order, customer, links.admin));
        if (order.paymentMethod === PaymentMethod.BANK_TRANSFER && customer) {
          await toCustomer(T.customerOrderPlacedEmail(app, order, customer.name, links.payment));
        }
        break;

      case 'payment.proof_uploaded': {
        const proof = order.paymentProofs?.[order.paymentProofs.length - 1];
        await this.toAdmins(T.adminPaymentProofEmail(app, order, customer, proof, links.admin));
        break;
      }

      case 'payment.confirmed':
        if (customer) await toCustomer(T.customerPaymentConfirmedEmail(app, order, customer.name, links.order));
        // Paystack (automatic) → tell admins. Manual confirmations were done by an admin already.
        if (bySystem) await this.toAdmins(T.adminPaymentReceivedEmail(app, order, customer, links.admin));
        break;

      case 'payment.rejected':
        if (customer) {
          await toCustomer(
            T.customerOrderUpdateEmail(app, order, customer.name, {
              subject: `Action needed: payment for ${n} not accepted`,
              heading: 'We couldn’t confirm your payment',
              message: `Your payment proof for order <strong>${T.escapeHtml(n)}</strong> was not accepted.<br>
                <strong>Reason:</strong> ${T.escapeHtml(order.paymentRejectionReason ?? 'Not specified')}<br><br>
                Please upload a new receipt or pay with your card before the deadline.`,
              ctaLabel: 'Pay again',
              tone: 'error',
            }, links.payment),
          );
        }
        break;

      case 'order.shipped':
        if (customer) {
          await toCustomer(
            T.customerOrderUpdateEmail(app, order, customer.name, {
              subject: `Your order ${n} is on its way 🚚`,
              heading: 'Your order has shipped',
              message: `Good news — order <strong>${T.escapeHtml(n)}</strong> has left our store and is on its way to you.`,
              ctaLabel: 'Track your order',
              tone: 'success',
            }, links.order, true),
          );
        }
        break;

      case 'order.delivered':
        if (customer) {
          await toCustomer(
            T.customerOrderUpdateEmail(app, order, customer.name, {
              subject: `Your order ${n} has been delivered 📦`,
              heading: 'Delivered — enjoy your fragrance!',
              message: `Order <strong>${T.escapeHtml(n)}</strong> has been delivered. Remember: scan the QR code on your bottle anytime to confirm it’s authentic.`,
              ctaLabel: 'View order',
              tone: 'success',
            }, links.order),
          );
        }
        break;

      case 'order.cancelled': {
        const refund = order.paymentStatus === PaymentStatus.REFUNDED;
        if (customer && !byCustomer) {
          await toCustomer(
            T.customerOrderUpdateEmail(app, order, customer.name, {
              subject: `Order ${n} cancelled`,
              heading: 'Your order was cancelled',
              message: `Order <strong>${T.escapeHtml(n)}</strong> has been cancelled.<br>
                <strong>Reason:</strong> ${T.escapeHtml(order.cancelReason ?? 'Not specified')}
                ${refund ? '<br><br>Your payment will be refunded to you.' : ''}`,
              ctaLabel: 'View order',
              tone: 'error',
            }, links.order),
          );
        }
        if (byCustomer || refund) {
          await this.toAdmins(
            T.adminAlertEmail(
              app,
              order,
              refund ? 'Refund required' : 'Order cancelled by customer',
              refund
                ? `Order ${n} was cancelled after payment. Please refund ${T.naira(order.total)} to the customer.`
                : `The customer cancelled order ${n}. Stock has been returned.`,
              links.admin,
            ),
          );
        }
        break;
      }

      case 'payment.mismatch':
        await this.toAdmins(
          T.adminAlertEmail(app, order, 'Paystack amount mismatch', `A Paystack payment for ${n} did not match the order total. Check the order before shipping.`, links.admin),
        );
        break;

      case 'payment.refund_required':
        await this.toAdmins(
          T.adminAlertEmail(app, order, 'Refund required', `Payment for ${n} arrived after the order was cancelled and the items are out of stock. Refund ${T.naira(order.total)} to the customer.`, links.admin),
        );
        if (customer) {
          await toCustomer(
            T.customerOrderUpdateEmail(app, order, customer.name, {
              subject: `About your payment for ${n}`,
              heading: 'Your payment will be refunded',
              message: `We received your payment for order <strong>${T.escapeHtml(n)}</strong>, but the order had already expired and the items sold out. We’re refunding <strong>${T.naira(order.total)}</strong> to you.`,
              ctaLabel: 'View order',
            }, links.order),
          );
        }
        break;
    }
  }

  private async toAdmins(email: T.Email) {
    const to = await this.adminRecipients();
    if (!to.length) {
      this.logger.warn(`No admin recipients for "${email.subject}" — set ADMIN_NOTIFY_EMAILS`);
      return;
    }
    await this.mail.send({ to, ...email });
  }

  private async adminRecipients(): Promise<string[]> {
    if (this.adminEmailsFromEnv.length) return this.adminEmailsFromEnv;
    const admins = await this.userModel.find({ role: Role.ADMIN, isActive: true }).select('email').lean().exec();
    return admins.map((a) => a.email);
  }
}