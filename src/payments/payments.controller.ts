import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { PaymentMethod } from '../common/enums/order.enum';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paystack: PaystackService,
  ) {}

  /* ---------- Public: which payment options to show at checkout ---------- */
  @Get('methods')
  async getMethods() {
    const bankAccounts = await this.paymentsService.findActiveAccounts();
    return {
      methods: [
        ...(this.paystack.isEnabled()
          ? [{ method: PaymentMethod.PAYSTACK, label: 'Pay with Card / Bank (Paystack)' }]
          : []),
        ...(bankAccounts.length
          ? [{ method: PaymentMethod.BANK_TRANSFER, label: 'Bank Transfer' }]
          : []),
      ],
      bankAccounts,
    };
  }

  @Get('bank-accounts')
  findActiveAccounts() {
    return this.paymentsService.findActiveAccounts();
  }

  /* ---------- Admin: bank accounts ---------- */
  @Get('bank-accounts/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin() {
    return this.paymentsService.findAllAdmin();
  }

  @Post('bank-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateBankAccountDto) {
    return this.paymentsService.create(dto);
  }

  @Patch('bank-accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.paymentsService.update(id, dto);
  }

  @Delete('bank-accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}