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
import { EventsService } from '../events/events.service';
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
  constructor(
    private readonly adminService: AdminService,
    private readonly events: EventsService,
  ) {}

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
  async blockUser(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
  ) {
    const result = await this.adminService.blockUser(adminId, id, dto.reason);
    // Log the user out instantly on any device they have open
    this.events.emit({ type: 'account.blocked', userId: id, actorId: adminId, userMessage: dto.reason });
    return result;
  }

  @Patch('users/:id/unblock')
  unblockUser(@Param('id') id: string) {
    return this.adminService.unblockUser(id);
  }

  @Patch('users/:id/role')
  async updateRole(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const result = await this.adminService.updateRole(adminId, id, dto.role);
    this.events.emit({
      type: 'account.updated',
      userId: id,
      actorId: adminId,
      userMessage: dto.role === Role.ADMIN ? 'You now have admin access' : 'Your admin access was removed',
    });
    return result;
  }

  /* ---------- Payments ---------- */
  @Get('payments')
  findPayments(@Query() query: AdminPaymentsQueryDto) {
    return this.adminService.findPayments(query);
  }
}