import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { AdminPaymentsQueryDto } from './dto/admin-payments-query.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/** Every route here is admin-only */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /* ---------- Dashboard ---------- */
  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  /* ---------- Users ---------- */
  @Get('users')
  findUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.findUsers(query);
  }

  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/block')
  blockUser(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.adminService.blockUser(adminId, id, dto.reason);
  }

  @Patch('users/:id/unblock')
  unblockUser(@Param('id') id: string) {
    return this.adminService.unblockUser(id);
  }

  @Patch('users/:id/role')
  updateRole(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.adminService.updateRole(adminId, id, dto.role);
  }

  /* ---------- Payments ---------- */
  @Get('payments')
  findPayments(@Query() query: AdminPaymentsQueryDto) {
    return this.adminService.findPayments(query);
  }
}