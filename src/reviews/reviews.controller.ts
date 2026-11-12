import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /* ---------- Public ---------- */
  @Get('perfume/:perfumeId')
  findForPerfume(@Param('perfumeId') perfumeId: string, @Query() query: ReviewQueryDto) {
    return this.reviewsService.findForPerfume(perfumeId, query);
  }

  /* ---------- Admin (static routes first) ---------- */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin(@Query() query: AdminReviewQueryDto) {
    return this.reviewsService.findAllAdmin(query);
  }

  @Patch('admin/:id/visibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  setVisibility(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewsService.setVisibility(id, dto);
  }

  @Patch('admin/:id/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reply(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.reviewsService.reply(adminId, id, dto.text);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRemove(@Param('id') id: string) {
    return this.reviewsService.adminRemove(id);
  }

  /* ---------- Customer ---------- */
  @Get('eligibility/:perfumeId')
  @UseGuards(JwtAuthGuard)
  getEligibility(@CurrentUser('id') userId: string, @Param('perfumeId') perfumeId: string) {
    return this.reviewsService.getEligibility(userId, perfumeId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviewsService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.reviewsService.remove(userId, id);
  }
}