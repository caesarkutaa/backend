import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor, NoFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_PERFUME_IMAGES, PerfumesService } from './perfumes.service';
import { CreatePerfumeDto } from './dto/create-perfume.dto';
import { UpdatePerfumeDto } from './dto/update-perfume.dto';
import { PerfumeQueryDto } from './dto/perfume-query.dto';
import { AdminPerfumeQueryDto } from './dto/admin-perfume-query.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { imageUploadOptions } from '../common/utils/image-upload.options';

@Controller('perfumes')
export class PerfumesController {
  constructor(private readonly perfumesService: PerfumesService) {}

  /* ===================== PUBLIC ===================== */

  /** Gallery with filters, search, sort, pagination */
  @Get()
  findGallery(@Query() query: PerfumeQueryDto) {
    return this.perfumesService.findGallery(query);
  }

  /* ===================== ADMIN (static routes first) ===================== */

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin(@Query() query: AdminPerfumeQueryDto) {
    return this.perfumesService.findAllAdmin(query);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findOneAdmin(@Param('id') id: string) {
    return this.perfumesService.findOneAdmin(id);
  }

  /* ===================== PUBLIC DETAIL (QR target) ===================== */

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.perfumesService.findBySlug(slug);
  }

  @Get('slug/:slug/related')
  findRelated(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.perfumesService.findRelated(slug, limit);
  }

  /* ===================== ADMIN: CREATE / UPDATE / DELETE ===================== */

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FilesInterceptor('images', MAX_PERFUME_IMAGES, imageUploadOptions))
  create(
    @Body() dto: CreatePerfumeDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
  ) {
    return this.perfumesService.create(dto, files, userId);
  }

  /** Accepts JSON or form-data (without files) */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(NoFilesInterceptor())
  update(@Param('id') id: string, @Body() dto: UpdatePerfumeDto) {
    return this.perfumesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.perfumesService.remove(id);
  }

  /* ===================== ADMIN: IMAGES ===================== */

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FilesInterceptor('images', MAX_PERFUME_IMAGES, imageUploadOptions))
  addImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.perfumesService.addImages(id, files);
  }

  /** DELETE /perfumes/:id/images?publicId=perfume-store/perfumes/abc123 */
  @Delete(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  removeImage(@Param('id') id: string, @Query('publicId') publicId: string) {
    return this.perfumesService.removeImage(id, publicId);
  }

  @Patch(':id/images/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reorderImages(@Param('id') id: string, @Body() dto: ReorderImagesDto) {
    return this.perfumesService.reorderImages(id, dto.publicIds);
  }

  /* ===================== ADMIN: QR CODE ===================== */

  /** Returns { qrCode, link, downloadUrl } — downloadUrl forces a PNG download */
  @Get(':id/qr-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getQrCode(@Param('id') id: string) {
    return this.perfumesService.getQrCode(id);
  }

  /** Downloads a print-quality SVG file */
  @Get(':id/qr-code/svg')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async downloadQrSvg(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, svg } = await this.perfumesService.getQrSvg(id);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.svg"`);
    return svg;
  }

  @Post(':id/qr-code/regenerate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  regenerateQrCode(@Param('id') id: string) {
    return this.perfumesService.regenerateQrCode(id);
  }
}