export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYSTACK = 'paystack',
}

export enum PaymentStatus {
  PENDING = 'pending', // waiting for payment
  AWAITING_CONFIRMATION = 'awaiting_confirmation', // bank transfer proof uploaded
  PAID = 'paid',
  REJECTED = 'rejected', // bank transfer proof rejected, customer can retry
  REFUNDED = 'refunded',
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum ProofStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}