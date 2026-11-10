import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UploadPaymentProofDto } from './dto/upload-payment-proof.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { imageUploadOptions } from '../common/utils/image-upload.options';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /* ===================== CUSTOMER ===================== */

  /** { paymentMethod: "paystack" | "bank_transfer", shippingAddress?, saveAddress?, note? } */
  @Post('checkout')
  checkout(@CurrentUser('id') userId: string, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(userId, dto);
  }

  @Get()
  findMyOrders(@CurrentUser('id') userId: string, @Query() query: OrderQueryDto) {
    return this.ordersService.findMyOrders(userId, query);
  }

  /** Frontend callback page calls this after Paystack redirects back */
  @Get('paystack/verify')
  verifyPaystack(
    @CurrentUser('id') userId: string,
    @Query('reference') reference: string,
  ) {
    return this.ordersService.verifyPaystackForUser(userId, reference);
  }

  /* ===================== ADMIN (static routes before :id) ===================== */

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin(@Query() query: OrderQueryDto) {
    return this.ordersService.findAllAdmin(query);
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getStats() {
    return this.ordersService.getAdminStats();
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findOneAdmin(@Param('id') id: string) {
    return this.ordersService.findOneAdmin(id);
  }

  @Patch('admin/:id/payment/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  confirmPayment(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.ordersService.confirmPayment(adminId, id);
  }

  @Patch('admin/:id/payment/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  rejectPayment(
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.ordersService.rejectPayment(adminId, id, dto.reason);
  }

  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.ordersService.updateStatus(adminId, id, dto);
  }

  /* ===================== CUSTOMER: SINGLE ORDER ===================== */

  @Get(':id')
  findMyOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ordersService.findMyOrder(userId, id);
  }

  /** Amount, deadline, bank accounts, and whether Paystack is available */
  @Get(':id/payment')
  getPaymentInstructions(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ordersService.getPaymentInstructions(userId, id);
  }

  /** Retry Paystack, or switch an unpaid bank-transfer order to Paystack */
  @Post(':id/pay/paystack')
  payWithPaystack(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ordersService.payWithPaystack(userId, id);
  }

  /** form-data: proof (File), bankAccountId, senderName, amountPaid?, note? */
  @Post(':id/payment-proof')
  @UseInterceptors(FileInterceptor('proof', imageUploadOptions))
  uploadPaymentProof(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UploadPaymentProofDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ordersService.uploadPaymentProof(userId, id, dto, file);
  }

  @Patch(':id/cancel')
  cancelMyOrder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelMyOrder(userId, id, dto.reason);
  }
}