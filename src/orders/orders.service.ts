import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderItem, PaymentProof } from './schemas/order.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { User } from '../users/schemas/user.schema';
import { CartService } from '../cart/cart.service';
import { PaymentsService } from '../payments/payments.service';
import { PaystackService } from '../payments/paystack.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { BankAccountDocument } from '../payments/schemas/bank-account.schema';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProofStatus,
} from '../common/enums/order.enum';
import { CheckoutDto } from './dto/checkout.dto';
import { UploadPaymentProofDto } from './dto/upload-payment-proof.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { escapeRegex, isObjectId } from '../common/utils/object.util';

/** Allowed manual status changes by admin (PROCESSING only comes from payment) */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

type StockLine = Pick<OrderItem, 'perfume' | 'variantId' | 'quantity' | 'name' | 'size'>;

interface MarkPaidOptions {
  method: PaymentMethod;
  note: string;
  adminId?: string; // set when an admin confirms a bank transfer
  reference?: string; // Paystack reference that succeeded
  channel?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly paymentWindowHours: number;
  private readonly shippingFee: number;
  private readonly freeShippingMin: number;
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly cartService: CartService,
    private readonly paymentsService: PaymentsService,
    private readonly paystack: PaystackService,
    private readonly cloudinary: CloudinaryService,
    config: ConfigService,
  ) {
    this.paymentWindowHours = Number(config.get('ORDER_PAYMENT_WINDOW_HOURS') ?? 24);
    this.shippingFee = Number(config.get('SHIPPING_FEE') ?? 0);
    this.freeShippingMin = Number(config.get('FREE_SHIPPING_MIN') ?? 0);
    this.frontendUrl = config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
  }

  /* =====================================================================
   *  CHECKOUT
   * ===================================================================*/
  async checkout(userId: string, dto: CheckoutDto) {
    const method = dto.paymentMethod ?? PaymentMethod.BANK_TRANSFER;

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) throw new NotFoundException('User not found');

    // Make sure the chosen method is actually available BEFORE touching stock
    let bankAccounts: BankAccountDocument[] = [];
    if (method === PaymentMethod.BANK_TRANSFER) {
      bankAccounts = await this.paymentsService.findActiveAccounts();
      if (!bankAccounts.length) {
        throw new BadRequestException(
          'Bank transfer is temporarily unavailable. Please pay with card instead.',
        );
      }
    } else if (!this.paystack.isEnabled()) {
      throw new BadRequestException(
        'Card payment is temporarily unavailable. Please use bank transfer.',
      );
    }

    const shippingAddress = dto.shippingAddress ? { ...dto.shippingAddress } : user.address;
    if (!shippingAddress) {
      throw new BadRequestException('Please provide a shipping address');
    }

    // Throws if empty, changed, or has out-of-stock items
    const cart = await this.cartService.getCartForCheckout(userId);

    const items: OrderItem[] = cart.items.map((item) => ({
      perfume: item.perfume._id,
      variantId: item.variant._id,
      name: item.perfume.name,
      brandName: item.perfume.brand?.name,
      image: item.perfume.image ?? undefined,
      size: item.variant.size,
      price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
    }));

    await this.reserveStock(items);

    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    const shippingFee = this.calculateShipping(subtotal);

    let order: OrderDocument;
    try {
      order = await this.orderModel.create({
        user: userId,
        items,
        shippingAddress,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
        paymentMethod: method,
        paymentDeadline: this.newDeadline(),
        note: dto.note,
        statusHistory: [
          { status: OrderStatus.PENDING, note: 'Order placed — awaiting payment', at: new Date() },
        ],
      });
    } catch (error) {
      await this.restoreStockFor(items);
      throw error;
    }

    // Paystack: get the checkout link. If Paystack is down, undo the order (cart is untouched).
    let paystackPayment: Awaited<ReturnType<OrdersService['startPaystackPayment']>> | null = null;
    if (method === PaymentMethod.PAYSTACK) {
      try {
        paystackPayment = await this.startPaystackPayment(order, user.email);
      } catch (error) {
        await this.cancelOrder(order, 'Payment could not be started');
        throw error;
      }
    }

    await this.cartService.clearCart(userId);

    if (dto.saveAddress && dto.shippingAddress) {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { address: { ...dto.shippingAddress } } },
      );
    }

    return {
      order,
      payment:
        method === PaymentMethod.PAYSTACK
          ? { method, ...paystackPayment! }
          : { method, ...this.buildBankInstructions(order, bankAccounts) },
    };
  }

  /* =====================================================================
   *  PAYSTACK
   * ===================================================================*/

  /** Retry Paystack (closed tab) or switch an unpaid bank-transfer order to Paystack */
  async payWithPaystack(userId: string, orderId: string) {
    const order = await this.findUserOrder(userId, orderId);
    this.assertPayable(order);

    const user = await this.userModel.findById(userId).select('email').lean().exec();
    if (!user) throw new NotFoundException('User not found');

    return this.startPaystackPayment(order, user.email);
  }

  /** Called by the frontend callback page: /orders/:id/payment/verify?reference=... */
  async verifyPaystackForUser(userId: string, reference: string) {
    if (!reference) throw new BadRequestException('Payment reference is required');

    const order = await this.orderModel
      .findOne({ user: userId, paymentReferences: reference })
      .exec();
    if (!order) throw new NotFoundException('No order found for this payment');

    const updated = await this.processPaystackReference(reference, 'callback');
    const latest = updated ?? order;

    return {
      orderId: latest._id,
      orderNumber: latest.orderNumber,
      paymentStatus: latest.paymentStatus,
      orderStatus: latest.orderStatus,
      paid: latest.paymentStatus === PaymentStatus.PAID,
    };
  }

  /**
   * The single place a Paystack payment is confirmed (used by callback, webhook and expiry job).
   * Always re-verifies with Paystack — never trusts the request alone.
   */
  async processPaystackReference(
    reference: string,
    source: 'callback' | 'webhook' | 'expiry-check',
  ): Promise<OrderDocument | null> {
    const order = await this.orderModel.findOne({ paymentReferences: reference }).exec();
    if (!order) {
      this.logger.warn(`Paystack reference ${reference} (${source}) matches no order`);
      return null;
    }

    if (order.paymentStatus === PaymentStatus.PAID) return order; // already handled

    const tx = await this.paystack.verify(reference);
    if (tx.status !== 'success') return order;

    const expectedKobo = Math.round(order.total * 100);
    if (tx.currency !== 'NGN' || tx.amount < expectedKobo) {
      this.logger.error(
        `Amount mismatch on ${order.orderNumber}: expected ${expectedKobo} kobo, got ${tx.amount} ${tx.currency}`,
      );
      this.addHistory(
        order,
        order.paymentStatus,
        `Paystack amount mismatch: received ₦${(tx.amount / 100).toLocaleString('en-NG')} — needs review`,
      );
      await order.save();
      return order;
    }

    if (order.orderStatus === OrderStatus.CANCELLED) {
      return this.handleLatePaystackPayment(order, reference, tx.channel);
    }

    return this.markAsPaid(order._id, {
      method: PaymentMethod.PAYSTACK,
      reference,
      channel: tx.channel,
      note: `Paid via Paystack (${tx.channel}) — confirmed by ${source}`,
    });
  }

  private async startPaystackPayment(order: OrderDocument, email: string) {
    const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

    // Save the reference first so a webhook can always find this order
    order.paymentReferences.push(reference);
    order.paymentMethod = PaymentMethod.PAYSTACK;
    await order.save();

    const result = await this.paystack.initialize({
      email,
      amountKobo: Math.round(order.total * 100),
      reference,
      callbackUrl: `${this.frontendUrl}/orders/${order._id}/payment/verify`,
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        cancel_action: `${this.frontendUrl}/orders/${order._id}`,
      },
    });

    return {
      authorizationUrl: result.authorizationUrl,
      accessCode: result.accessCode,
      reference,
      amount: order.total,
    };
  }

  /** Money arrived after the order expired: reopen it if stock allows, else flag for refund */
  private async handleLatePaystackPayment(
    order: OrderDocument,
    reference: string,
    channel: string,
  ): Promise<OrderDocument> {
    try {
      await this.reserveStock(order.items);
      order.orderStatus = OrderStatus.PENDING;
      order.stockRestored = false;
      order.cancelledAt = undefined;
      order.cancelReason = undefined;
      this.addHistory(order, OrderStatus.PENDING, 'Order reopened — payment arrived after cancellation');
      await order.save();

      return this.markAsPaid(order._id, {
        method: PaymentMethod.PAYSTACK,
        reference,
        channel,
        note: `Paid via Paystack (${channel}) after reopening`,
      });
    } catch {
      order.paymentStatus = PaymentStatus.PAID;
      order.paymentMethod = PaymentMethod.PAYSTACK;
      order.paidAt = new Date();
      order.paidReference = reference;
      order.paymentChannel = channel;
      this.addHistory(
        order,
        OrderStatus.CANCELLED,
        'REFUND REQUIRED: payment received after cancellation but items are out of stock',
      );
      await order.save();
      this.logger.error(`Refund required for ${order.orderNumber} (${reference})`);
      return order;
    }
  }

  /* =====================================================================
   *  BANK TRANSFER (customer)
   * ===================================================================*/
  async getPaymentInstructions(userId: string, orderId: string) {
    const order = await this.findUserOrder(userId, orderId);
    const payable = this.isPayable(order);
    const bankAccounts = payable ? await this.paymentsService.findActiveAccounts() : [];

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      rejectionReason: order.paymentRejectionReason ?? null,
      amount: order.total,
      deadline: order.paymentDeadline,
      payable,
      paystackEnabled: payable && this.paystack.isEnabled(),
      bankTransfer: bankAccounts.length
        ? this.buildBankInstructions(order, bankAccounts)
        : null,
    };
  }

  async uploadPaymentProof(
    userId: string,
    orderId: string,
    dto: UploadPaymentProofDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload a screenshot of your payment receipt');
    }

    const order = await this.findUserOrder(userId, orderId);

    if (order.paymentStatus === PaymentStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException(
        'Your payment proof is already being reviewed. We will update you shortly.',
      );
    }
    this.assertPayable(order);

    const account = await this.paymentsService.findActiveById(dto.bankAccountId);
    const image = await this.cloudinary.uploadImage(file, 'payment-proofs');

    order.paymentProofs.push({
      image,
      bankAccount: {
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
      },
      senderName: dto.senderName,
      amountPaid: dto.amountPaid,
      note: dto.note,
      status: ProofStatus.PENDING,
      uploadedAt: new Date(),
    } as PaymentProof);

    order.paymentMethod = PaymentMethod.BANK_TRANSFER; // customer chose transfer
    order.paymentStatus = PaymentStatus.AWAITING_CONFIRMATION;
    order.paymentRejectionReason = undefined;
    this.addHistory(order, PaymentStatus.AWAITING_CONFIRMATION, 'Payment proof uploaded', userId);

    try {
      await order.save();
    } catch (error) {
      await this.cloudinary.deleteImage(image.publicId);
      throw error;
    }

    return order;
  }

  /* =====================================================================
   *  CUSTOMER: ORDERS
   * ===================================================================*/
  async findMyOrders(userId: string, query: OrderQueryDto) {
    const { page, limit, search, paymentStatus, orderStatus } = query;
    const filter: Record<string, any> = { user: userId };

    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (orderStatus) filter.orderStatus = orderStatus;
    if (search?.trim()) {
      filter.orderNumber = new RegExp(escapeRegex(search.trim()), 'i');
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .select('-statusHistory -paymentProofs -paymentReferences')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findMyOrder(userId: string, orderId: string): Promise<OrderDocument> {
    return this.findUserOrder(userId, orderId);
  }

  async cancelMyOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.findUserOrder(userId, orderId);

    if (order.paymentStatus === PaymentStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException(
        'Your payment is being reviewed. Contact support to cancel this order.',
      );
    }
    if (!this.isPayable(order)) {
      throw new BadRequestException('This order can no longer be cancelled');
    }

    await this.cancelOrder(order, reason || 'Cancelled by customer', userId);
    return order;
  }

  /* =====================================================================
   *  ADMIN
   * ===================================================================*/
  async findAllAdmin(query: OrderQueryDto) {
    const { page, limit, search, paymentStatus, orderStatus } = query;
    const filter: Record<string, any> = {};

    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (orderStatus) filter.orderStatus = orderStatus;

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      const users = await this.userModel
        .find({ $or: [{ email: regex }, { name: regex }] })
        .select('_id')
        .exec();

      filter.$or = [
        { orderNumber: regex },
        { paymentReferences: regex },
        { 'shippingAddress.fullName': regex },
        { 'shippingAddress.phone': regex },
        ...(users.length ? [{ user: { $in: users.map((u) => u._id) } }] : []),
      ];
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .select('-statusHistory')
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOneAdmin(orderId: string): Promise<OrderDocument> {
    if (!isObjectId(orderId)) throw new NotFoundException('Order not found');
    const order = await this.orderModel
      .findById(orderId)
      .populate('user', 'name email phone')
      .populate('paymentReviewedBy', 'name email')
      .populate('statusHistory.changedBy', 'name')
      .exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Admin confirms a bank transfer (also allowed if money arrived without a screenshot) */
  async confirmPayment(adminId: string, orderId: string) {
    const order = await this.findOrderById(orderId);

    if (order.orderStatus === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot confirm payment for a cancelled order');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Payment has already been confirmed');
    }
    if (
      order.paymentStatus !== PaymentStatus.AWAITING_CONFIRMATION &&
      order.paymentStatus !== PaymentStatus.PENDING
    ) {
      throw new BadRequestException(`Cannot confirm a payment that is ${order.paymentStatus}`);
    }

    await this.markAsPaid(order._id, {
      method: PaymentMethod.BANK_TRANSFER,
      adminId,
      note: 'Bank transfer confirmed by admin',
    });

    return this.findOneAdmin(orderId);
  }

  async rejectPayment(adminId: string, orderId: string, reason: string) {
    const order = await this.findOrderById(orderId);

    if (order.paymentStatus !== PaymentStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException('There is no payment proof waiting for review');
    }

    const proof = [...order.paymentProofs]
      .reverse()
      .find((p) => p.status === ProofStatus.PENDING);
    if (proof) {
      proof.status = ProofStatus.REJECTED;
      proof.rejectionReason = reason;
    }

    order.paymentStatus = PaymentStatus.REJECTED;
    order.paymentRejectionReason = reason;
    order.paymentReviewedBy = new Types.ObjectId(adminId);
    order.paymentReviewedAt = new Date();
    order.paymentDeadline = this.newDeadline(); // time to re-upload or pay with card
    this.addHistory(order, PaymentStatus.REJECTED, `Payment proof rejected: ${reason}`, adminId);

    await order.save();
    return this.findOneAdmin(orderId);
  }

  async updateStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrderById(orderId);
    const allowed = ALLOWED_TRANSITIONS[order.orderStatus];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot change order from "${order.orderStatus}" to "${dto.status}"`,
      );
    }

    if (dto.status === OrderStatus.CANCELLED) {
      await this.cancelOrder(order, dto.note || 'Cancelled by admin', adminId);
      return this.findOneAdmin(orderId);
    }

    order.orderStatus = dto.status;
    if (dto.status === OrderStatus.SHIPPED) order.shippedAt = new Date();
    if (dto.status === OrderStatus.DELIVERED) order.deliveredAt = new Date();
    this.addHistory(order, dto.status, dto.note, adminId);

    await order.save();
    return this.findOneAdmin(orderId);
  }

  async getAdminStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const paidMatch = { paymentStatus: PaymentStatus.PAID, orderStatus: { $ne: OrderStatus.CANCELLED } };

    const [result] = await this.orderModel
      .aggregate([
        {
          $facet: {
            byOrderStatus: [{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }],
            byPaymentStatus: [{ $group: { _id: '$paymentStatus', count: { $sum: 1 } } }],
            byMethod: [
              { $match: paidMatch },
              { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$total' } } },
            ],
            revenue: [
              { $match: paidMatch },
              { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
            ],
            revenueThisMonth: [
              { $match: { ...paidMatch, paidAt: { $gte: startOfMonth } } },
              { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
            ],
            refundRequired: [
              { $match: { paymentStatus: PaymentStatus.PAID, orderStatus: OrderStatus.CANCELLED } },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();

    const toMap = (rows: { _id: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row._id, row.count]));

    return {
      ordersByStatus: toMap(result.byOrderStatus),
      ordersByPaymentStatus: toMap(result.byPaymentStatus),
      revenueByMethod: Object.fromEntries(
        result.byMethod.map((row: any) => [row._id, { orders: row.count, total: row.total }]),
      ),
      awaitingConfirmation:
        toMap(result.byPaymentStatus)[PaymentStatus.AWAITING_CONFIRMATION] ?? 0,
      refundRequired: result.refundRequired[0]?.count ?? 0,
      totalRevenue: result.revenue[0]?.total ?? 0,
      paidOrders: result.revenue[0]?.count ?? 0,
      revenueThisMonth: result.revenueThisMonth[0]?.total ?? 0,
      paidOrdersThisMonth: result.revenueThisMonth[0]?.count ?? 0,
    };
  }

  /* =====================================================================
   *  AUTO-CANCEL UNPAID ORDERS (every 10 minutes)
   * ===================================================================*/
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cancelExpiredOrders() {
    const expired = await this.orderModel
      .find({
        orderStatus: OrderStatus.PENDING,
        paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.REJECTED] },
        paymentDeadline: { $lt: new Date() },
      })
      .limit(100)
      .exec();

    let cancelled = 0;
    for (const order of expired) {
      try {
        // Last chance: maybe they paid on Paystack but the webhook/callback never arrived
        if (order.paymentReferences.length && this.paystack.isEnabled()) {
          const lastRef = order.paymentReferences[order.paymentReferences.length - 1];
          const checked = await this.processPaystackReference(lastRef, 'expiry-check');
          if (checked?.paymentStatus === PaymentStatus.PAID) continue;
        }

        const fresh = await this.orderModel.findById(order._id).exec();
        if (fresh && this.isPayable(fresh)) {
          await this.cancelOrder(fresh, 'Payment was not received before the deadline');
          cancelled++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to process expired ${order.orderNumber}: ${error?.message}`);
      }
    }

    if (cancelled) this.logger.log(`Auto-cancelled ${cancelled} unpaid order(s)`);
  }

  /* =====================================================================
   *  HELPERS
   * ===================================================================*/

  /**
   * Atomic "claim": only ONE caller (webhook, callback or admin) can flip an order to PAID,
   * so totalSold is never incremented twice.
   */
  private async markAsPaid(
    orderId: Types.ObjectId,
    opts: MarkPaidOptions,
  ): Promise<OrderDocument> {
    const now = new Date();

    const $set: Record<string, any> = {
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: opts.method,
      paidAt: now,
      orderStatus: OrderStatus.PROCESSING,
    };
    if (opts.reference) $set.paidReference = opts.reference;
    if (opts.channel) $set.paymentChannel = opts.channel;
    if (opts.adminId) {
      $set.paymentReviewedBy = new Types.ObjectId(opts.adminId);
      $set.paymentReviewedAt = now;
      $set['paymentProofs.$[proof].status'] = ProofStatus.APPROVED;
    }

    const paid = await this.orderModel
      .findOneAndUpdate(
        {
          _id: orderId,
          paymentStatus: { $ne: PaymentStatus.PAID },
          orderStatus: { $ne: OrderStatus.CANCELLED },
        },
        {
          $set,
          $unset: { paymentRejectionReason: '' },
          $push: {
            statusHistory: {
              status: OrderStatus.PROCESSING,
              note: opts.note,
              changedBy: opts.adminId ? new Types.ObjectId(opts.adminId) : undefined,
              at: now,
            },
          },
        },
        {
          new: true,
          ...(opts.adminId ? { arrayFilters: [{ 'proof.status': ProofStatus.PENDING }] } : {}),
        },
      )
      .exec();

    if (!paid) {
      // Someone else already marked it paid (or it was cancelled) — just return current state
      const current = await this.orderModel.findById(orderId).exec();
      if (!current) throw new NotFoundException('Order not found');
      return current;
    }

    await this.adjustTotalSold(paid.items, 1);
    return paid;
  }

  private async findUserOrder(userId: string, orderId: string): Promise<OrderDocument> {
    if (!isObjectId(orderId)) throw new NotFoundException('Order not found');
    const order = await this.orderModel.findOne({ _id: orderId, user: userId }).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async findOrderById(orderId: string): Promise<OrderDocument> {
    if (!isObjectId(orderId)) throw new NotFoundException('Order not found');
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private isPayable(order: OrderDocument): boolean {
    return (
      order.orderStatus === OrderStatus.PENDING &&
      (order.paymentStatus === PaymentStatus.PENDING ||
        order.paymentStatus === PaymentStatus.REJECTED)
    );
  }

  private assertPayable(order: OrderDocument) {
    if (order.orderStatus === OrderStatus.CANCELLED) {
      throw new BadRequestException('This order was cancelled. Please place a new order.');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This order has already been paid');
    }
    if (!this.isPayable(order)) {
      throw new BadRequestException('This order cannot be paid right now');
    }
  }

  /** Cancels, restores stock once, and reverses sales if it was already paid */
  private async cancelOrder(order: OrderDocument, reason: string, byUserId?: string) {
    const wasPaid = order.paymentStatus === PaymentStatus.PAID;

    order.orderStatus = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    if (wasPaid) order.paymentStatus = PaymentStatus.REFUNDED; // refund handled manually / on Paystack dashboard

    if (!order.stockRestored) {
      await this.restoreStockFor(order.items);
      order.stockRestored = true;
    }

    this.addHistory(order, OrderStatus.CANCELLED, reason, byUserId);
    await order.save();

    if (wasPaid) await this.adjustTotalSold(order.items, -1);
  }

  /** Conditional decrement per line — two customers can never buy the same last bottle */
  private async reserveStock(lines: StockLine[]) {
    const reserved: StockLine[] = [];

    for (const line of lines) {
      const result = await this.perfumeModel.updateOne(
        {
          _id: line.perfume,
          isActive: true,
          variants: { $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity } } },
        },
        { $inc: { 'variants.$.stock': -line.quantity } },
      );

      if (result.modifiedCount === 0) {
        await this.restoreStockFor(reserved);
        throw new BadRequestException(
          `Sorry, "${line.name}" (${line.size}ml) just sold out or has less stock than requested. ` +
            'Please review your cart.',
        );
      }

      reserved.push(line);
    }
  }

  private async restoreStockFor(lines: StockLine[]) {
    await Promise.all(
      lines.map((line) =>
        this.perfumeModel.updateOne(
          { _id: line.perfume, 'variants._id': line.variantId },
          { $inc: { 'variants.$.stock': line.quantity } },
        ),
      ),
    );
  }

  private async adjustTotalSold(items: OrderItem[], direction: 1 | -1) {
    if (!items.length) return;
    await this.perfumeModel.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item.perfume },
          update: { $inc: { totalSold: direction * item.quantity } },
        },
      })),
    );
  }

  private addHistory(order: OrderDocument, status: string, note?: string, byUserId?: string) {
    order.statusHistory.push({
      status,
      note,
      changedBy: byUserId ? new Types.ObjectId(byUserId) : undefined,
      at: new Date(),
    });
  }

  private calculateShipping(subtotal: number): number {
    if (this.freeShippingMin > 0 && subtotal >= this.freeShippingMin) return 0;
    return this.shippingFee; // SHIPPING_FEE=0 -> always free
  }

  private newDeadline(): Date {
    return new Date(Date.now() + this.paymentWindowHours * 60 * 60 * 1000);
  }

  private buildBankInstructions(order: OrderDocument, bankAccounts: BankAccountDocument[]) {
    const deadline = order.paymentDeadline.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
    });
    return {
      amount: order.total,
      reference: order.orderNumber,
      deadline: order.paymentDeadline,
      bankAccounts,
      message:
        `Transfer exactly ₦${order.total.toLocaleString('en-NG')} to any of the accounts below. ` +
        `Use "${order.orderNumber}" as your transfer narration, then upload a screenshot ` +
        `of your payment receipt before ${deadline}.`,
    };
  }
}