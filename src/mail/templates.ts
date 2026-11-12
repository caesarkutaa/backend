/* =====================================================================
 *  Email templates — navy / gold / white, table-based for email clients
 * ===================================================================*/

const NAVY = '#0b1f3a';
const GOLD = '#c9a227';
const GOLD_DARK = '#9a7716';
const MUTED = '#5b6472';
const BORDER = '#e7e2d6';
const SURFACE = '#f9f7f2';
const ERROR = '#dc2626';
const SUCCESS = '#15803d';

export interface Email {
  subject: string;
  html: string;
  text: string;
}

export interface MailOrder {
  orderNumber: string;
  items: { name: string; brandName?: string; size: number; price: number; quantity: number; subtotal: number }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  shippingAddress: { fullName: string; phone: string; street: string; city: string; state: string; country?: string };
  createdAt?: Date | string;
  paymentDeadline?: Date | string;
  paidAt?: Date | string;
  paidReference?: string;
  paymentChannel?: string;
  paymentRejectionReason?: string;
  cancelReason?: string;
  note?: string;
}

export interface MailCustomer {
  name: string;
  email: string;
}

export interface MailProof {
  senderName: string;
  amountPaid?: number;
  note?: string;
  image?: { url: string };
  bankAccount?: { bankName: string; accountNumber: string };
}

/* ---------------- Helpers ---------------- */
export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const naira = (amount: number) => `₦${Number(amount || 0).toLocaleString('en-NG')}`;

const fmtDate = (value?: Date | string) =>
  value
    ? new Date(value).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })
    : '';

const methodLabel = (method: string) => (method === 'paystack' ? 'Card (Paystack)' : 'Bank transfer');
const firstName = (name: string) => escapeHtml(name.split(' ')[0] || name);

function button(label: string, url: string) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px">
    <tr><td style="background:${NAVY}">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};text-decoration:none">${escapeHtml(label)}</a>
    </td></tr>
  </table>
  <p style="margin:6px 0 0;font-size:12px;color:${MUTED}">Button not working? Open this link:<br>
    <a href="${escapeHtml(url)}" style="color:${NAVY};word-break:break-all">${escapeHtml(url)}</a>
  </p>`;
}

function section(title: string, inner: string) {
  return `
  <div style="margin-top:26px">
    <div style="font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${GOLD_DARK};margin-bottom:8px">${escapeHtml(title)}</div>
    ${inner}
  </div>`;
}

/** rows: [label, already-escaped HTML value] */
function infoTable(rows: [string, string | undefined][]) {
  const body = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 14px;font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:8px 14px;font-size:13px;font-weight:bold;color:${NAVY}">${value}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border-left:4px solid ${GOLD};margin-top:18px">${body}</table>`;
}

function callout(html: string, tone: 'gold' | 'error' | 'success' = 'gold') {
  const color = tone === 'error' ? ERROR : tone === 'success' ? SUCCESS : GOLD;
  return `<div style="margin-top:18px;padding:14px 16px;border-left:4px solid ${color};background:${SURFACE};font-size:14px;line-height:1.6;color:${NAVY}">${html}</div>`;
}

function itemsTable(order: MailOrder) {
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px">
          ${i.brandName ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${GOLD_DARK}">${escapeHtml(i.brandName)}</div>` : ''}
          <div style="font-weight:bold;color:${NAVY}">${escapeHtml(i.name)}</div>
          <div style="font-size:12px;color:${MUTED}">${i.size}ml · ${naira(i.price)} × ${i.quantity}</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;font-weight:bold;white-space:nowrap;color:${NAVY}">${naira(i.subtotal)}</td>
      </tr>`,
    )
    .join('');

  const totals = `
    <tr><td style="padding:12px 0 4px;font-size:14px;color:${MUTED}">Subtotal</td><td align="right" style="padding:12px 0 4px;font-size:14px">${naira(order.subtotal)}</td></tr>
    <tr><td style="padding:4px 0 12px;font-size:14px;color:${MUTED}">Delivery</td><td align="right" style="padding:4px 0 12px;font-size:14px">${order.shippingFee ? naira(order.shippingFee) : 'Free'}</td></tr>
    <tr>
      <td style="padding:12px 0 0;border-top:2px solid ${GOLD};font-size:16px;font-weight:bold;color:${NAVY}">Total</td>
      <td align="right" style="padding:12px 0 0;border-top:2px solid ${GOLD};font-size:18px;font-weight:bold;color:${NAVY}">${naira(order.total)}</td>
    </tr>`;

  return section('Order summary', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${totals}</table>`);
}

function addressBlock(order: MailOrder) {
  const a = order.shippingAddress;
  return section(
    'Delivery address',
    `<p style="margin:0;font-size:14px;line-height:1.6;color:${NAVY}">
      <strong>${escapeHtml(a.fullName)}</strong><br>
      ${escapeHtml(a.street)}<br>
      ${escapeHtml(a.city)}, ${escapeHtml(a.state)}<br>
      ${escapeHtml(a.country ?? 'Nigeria')}<br>
      ${escapeHtml(a.phone)}
    </p>`,
  );
}

function layout(o: {
  appName: string;
  preheader: string;
  heading: string;
  intro: string; // HTML
  body?: string; // HTML
  cta?: { label: string; url: string };
  footerNote?: string; // HTML
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1eee6;font-family:Arial,Helvetica,sans-serif;color:${NAVY}">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(o.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eee6;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:4px solid ${GOLD}">
        <tr><td style="background:${NAVY};padding:20px 28px">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:${GOLD}">${escapeHtml(o.appName)}</span><span style="font-size:22px;color:#ffffff">.</span>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:normal;color:${NAVY}">${escapeHtml(o.heading)}</h1>
          <div style="width:48px;height:2px;background:${GOLD};margin:0 0 18px"></div>
          <div style="font-size:15px;line-height:1.6;color:${NAVY}">${o.intro}</div>
          ${o.body ?? ''}
          ${o.cta ? button(o.cta.label, o.cta.url) : ''}
        </td></tr>
        <tr><td style="background:${SURFACE};padding:18px 28px;font-size:12px;line-height:1.6;color:${MUTED}">
          ${o.footerNote ? `${o.footerNote}<br><br>` : ''}
          © ${new Date().getFullYear()} ${escapeHtml(o.appName)} · Authentic fragrances, verified by QR
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* =====================================================================
 *  ADMIN EMAILS
 * ===================================================================*/
export function adminNewOrderEmail(app: string, order: MailOrder, customer: MailCustomer | null, adminUrl: string): Email {
  const who = customer ? `${escapeHtml(customer.name)} (${escapeHtml(customer.email)})` : 'Unknown customer';
  const awaiting = order.paymentMethod === 'paystack' ? 'Awaiting Paystack payment' : 'Awaiting bank transfer';

  return {
    subject: `🛍️ New order ${order.orderNumber} · ${naira(order.total)}`,
    html: layout({
      appName: app,
      preheader: `${customer?.name ?? 'A customer'} placed an order for ${naira(order.total)}`,
      heading: 'New order received',
      intro: `A new order has been placed by <strong>${escapeHtml(customer?.name ?? 'a customer')}</strong>.`,
      body:
        infoTable([
          ['Order', `<span style="font-family:monospace">${escapeHtml(order.orderNumber)}</span>`],
          ['Customer', who],
          ['Total', naira(order.total)],
          ['Payment', `${methodLabel(order.paymentMethod)} — ${awaiting}`],
          ['Placed', fmtDate(order.createdAt)],
          ['Note', order.note ? escapeHtml(order.note) : undefined],
        ]) +
        itemsTable(order) +
        addressBlock(order),
      cta: { label: 'View order', url: adminUrl },
    }),
    text: `New order ${order.orderNumber} — ${naira(order.total)}\nCustomer: ${customer?.name ?? ''} ${customer?.email ?? ''}\nPayment: ${methodLabel(order.paymentMethod)} (${awaiting})\nView: ${adminUrl}`,
  };
}

export function adminPaymentProofEmail(
  app: string,
  order: MailOrder,
  customer: MailCustomer | null,
  proof: MailProof | undefined,
  adminUrl: string,
): Email {
  const short = proof?.amountPaid != null && proof.amountPaid < order.total;
  const amountSent =
    proof?.amountPaid != null
      ? `<span style="color:${short ? ERROR : SUCCESS}">${naira(proof.amountPaid)}${short ? ' — LESS than amount due' : ''}</span>`
      : undefined;

  return {
    subject: `💳 Payment proof uploaded · ${order.orderNumber} · ${naira(order.total)}`,
    html: layout({
      appName: app,
      preheader: `${customer?.name ?? 'A customer'} uploaded a payment proof for ${order.orderNumber}`,
      heading: 'Payment proof uploaded',
      intro: `<strong>${escapeHtml(customer?.name ?? 'A customer')}</strong> says they have paid for order <strong>${escapeHtml(order.orderNumber)}</strong>. Check that the money has arrived in your account, then approve or reject the proof.`,
      body:
        infoTable([
          ['Amount due', naira(order.total)],
          ['Amount sent', amountSent],
          ['Sender name', proof ? escapeHtml(proof.senderName) : undefined],
          ['Paid into', proof?.bankAccount ? `${escapeHtml(proof.bankAccount.bankName)} · ${escapeHtml(proof.bankAccount.accountNumber)}` : undefined],
          ['Narration', `<span style="font-family:monospace">${escapeHtml(order.orderNumber)}</span>`],
          ['Customer', customer ? `${escapeHtml(customer.name)} (${escapeHtml(customer.email)})` : undefined],
          ['Customer note', proof?.note ? escapeHtml(proof.note) : undefined],
        ]) +
        (proof?.image?.url
          ? section(
              'Receipt screenshot',
              `<a href="${escapeHtml(proof.image.url)}"><img src="${escapeHtml(proof.image.url)}" alt="Payment receipt" width="260" style="max-width:100%;border:1px solid ${BORDER};display:block"></a>`,
            )
          : '') +
        itemsTable(order),
      cta: { label: 'Review payment', url: adminUrl },
    }),
    text: `Payment proof uploaded for ${order.orderNumber}\nAmount due: ${naira(order.total)}\nAmount sent: ${proof?.amountPaid != null ? naira(proof.amountPaid) : 'not stated'}\nSender: ${proof?.senderName ?? ''}\nReview: ${adminUrl}`,
  };
}

export function adminPaymentReceivedEmail(app: string, order: MailOrder, customer: MailCustomer | null, adminUrl: string): Email {
  return {
    subject: `💰 Payment received · ${order.orderNumber} · ${naira(order.total)}`,
    html: layout({
      appName: app,
      preheader: `${order.orderNumber} has been paid — ready to prepare`,
      heading: 'Payment received',
      intro: `Order <strong>${escapeHtml(order.orderNumber)}</strong> has been paid and is ready to be prepared for delivery.`,
      body:
        infoTable([
          ['Amount', naira(order.total)],
          ['Method', methodLabel(order.paymentMethod)],
          ['Channel', order.paymentChannel ? escapeHtml(order.paymentChannel) : undefined],
          ['Reference', order.paidReference ? `<span style="font-family:monospace">${escapeHtml(order.paidReference)}</span>` : undefined],
          ['Paid', fmtDate(order.paidAt)],
          ['Customer', customer ? `${escapeHtml(customer.name)} (${escapeHtml(customer.email)})` : undefined],
        ]) +
        itemsTable(order) +
        addressBlock(order),
      cta: { label: 'View order', url: adminUrl },
    }),
    text: `Payment received for ${order.orderNumber} — ${naira(order.total)}\nReference: ${order.paidReference ?? ''}\nView: ${adminUrl}`,
  };
}

export function adminAlertEmail(app: string, order: MailOrder, title: string, message: string, adminUrl: string): Email {
  return {
    subject: `⚠️ ${title} · ${order.orderNumber}`,
    html: layout({
      appName: app,
      preheader: `${title} — ${order.orderNumber}`,
      heading: title,
      intro: escapeHtml(message),
      body:
        infoTable([
          ['Order', `<span style="font-family:monospace">${escapeHtml(order.orderNumber)}</span>`],
          ['Total', naira(order.total)],
          ['Payment', `${methodLabel(order.paymentMethod)} — ${escapeHtml(order.paymentStatus)}`],
          ['Status', escapeHtml(order.orderStatus)],
          ['Reason', order.cancelReason ? escapeHtml(order.cancelReason) : undefined],
        ]) + itemsTable(order),
      cta: { label: 'Open order', url: adminUrl },
    }),
    text: `${title} — ${order.orderNumber}\n${message}\nOpen: ${adminUrl}`,
  };
}

/* =====================================================================
 *  CUSTOMER EMAILS
 * ===================================================================*/
export function customerOrderPlacedEmail(app: string, order: MailOrder, name: string, paymentUrl: string): Email {
  return {
    subject: `Order ${order.orderNumber} received — complete your payment`,
    html: layout({
      appName: app,
      preheader: `Transfer ${naira(order.total)} using ${order.orderNumber} as the narration`,
      heading: 'Thank you for your order',
      intro: `Hi ${firstName(name)}, we’ve reserved your items. To complete your order, transfer <strong>${naira(order.total)}</strong> and upload your receipt.`,
      body:
        callout(
          `Use <strong style="font-family:monospace;font-size:16px">${escapeHtml(order.orderNumber)}</strong> as your transfer narration.<br>
           Please pay before <strong>${fmtDate(order.paymentDeadline)}</strong> — unpaid orders are cancelled automatically.`,
        ) +
        itemsTable(order) +
        addressBlock(order),
      cta: { label: 'See bank details & upload receipt', url: paymentUrl },
    }),
    text: `Hi ${name}, thanks for your order ${order.orderNumber}.\nTransfer ${naira(order.total)} using ${order.orderNumber} as the narration and upload your receipt before ${fmtDate(order.paymentDeadline)}.\n${paymentUrl}`,
  };
}

export function customerPaymentConfirmedEmail(app: string, order: MailOrder, name: string, orderUrl: string): Email {
  return {
    subject: `Payment confirmed — order ${order.orderNumber}`,
    html: layout({
      appName: app,
      preheader: `We received ${naira(order.total)} — your order is being prepared`,
      heading: 'Payment confirmed 🎉',
      intro: `Hi ${firstName(name)}, we’ve received your payment of <strong>${naira(order.total)}</strong>. Your order is now being prepared for delivery — we’ll email you when it ships.`,
      body: itemsTable(order) + addressBlock(order),
      cta: { label: 'Track your order', url: orderUrl },
    }),
    text: `Hi ${name}, your payment of ${naira(order.total)} for ${order.orderNumber} is confirmed. Track it here: ${orderUrl}`,
  };
}

export function customerOrderUpdateEmail(
  app: string,
  order: MailOrder,
  name: string,
  content: { subject: string; heading: string; message: string; ctaLabel: string; tone?: 'gold' | 'error' | 'success' },
  url: string,
  showItems = false,
): Email {
  return {
    subject: content.subject,
    html: layout({
      appName: app,
      preheader: content.heading,
      heading: content.heading,
      intro: `Hi ${firstName(name)},`,
      body: callout(content.message, content.tone ?? 'gold') + (showItems ? itemsTable(order) : ''),
      cta: { label: content.ctaLabel, url },
    }),
    text: `Hi ${name},\n${content.message.replace(/<[^>]+>/g, '')}\n${url}`,
  };
}

/* =====================================================================
 *  ACCOUNT EMAILS
 * ===================================================================*/
export function passwordResetEmail(app: string, name: string, url: string, minutes: number): Email {
  return {
    subject: `Reset your ${app} password`,
    html: layout({
      appName: app,
      preheader: `Your password reset link (valid for ${minutes} minutes)`,
      heading: 'Reset your password',
      intro: `Hi ${firstName(name)}, we received a request to reset your password. Click the button below to choose a new one.`,
      body: callout(`This link expires in <strong>${minutes} minutes</strong> and can only be used once.`),
      cta: { label: 'Reset password', url },
      footerNote: 'If you didn’t ask to reset your password, you can safely ignore this email — your password won’t change.',
    }),
    text: `Hi ${name},\nReset your password here (valid for ${minutes} minutes): ${url}\nIf you didn’t request this, ignore this email.`,
  };
}

export function passwordChangedEmail(app: string, name: string, loginUrl: string, resetUrl: string): Email {
  return {
    subject: `Your ${app} password was changed`,
    html: layout({
      appName: app,
      preheader: 'Your password was just changed',
      heading: 'Password changed',
      intro: `Hi ${firstName(name)}, your password was changed on ${fmtDate(new Date())}. For your security, you’ve been signed out on all devices.`,
      body: callout(
        `If this wasn’t you, <a href="${escapeHtml(resetUrl)}" style="color:${ERROR};font-weight:bold">reset your password immediately</a> and contact us.`,
        'error',
      ),
      cta: { label: 'Log in', url: loginUrl },
    }),
    text: `Hi ${name}, your password was changed. If this wasn’t you, reset it immediately: ${resetUrl}`,
  };
}