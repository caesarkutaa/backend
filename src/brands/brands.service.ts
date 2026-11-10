import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Brand, BrandDocument } from './schemas/brand.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { AdminListQueryDto } from '../common/dto/admin-list-query.dto';
import { generateUniqueSlug } from '../common/utils/slug.util';
import { compact, escapeRegex, isObjectId } from '../common/utils/object.util';

@Injectable()
export class BrandsService {
  private readonly folder = 'brands';

  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ---------- Create ---------- */
  async create(dto: CreateBrandDto, file?: Express.Multer.File): Promise<BrandDocument> {
    await this.ensureNameAvailable(dto.name);
    const slug = await generateUniqueSlug(this.brandModel, dto.name);
    const logo = file ? await this.cloudinary.uploadImage(file, this.folder) : undefined;

    try {
      return await this.brandModel.create({ ...compact(dto), slug, logo });
    } catch (error) {
      await this.cloudinary.deleteImage(logo?.publicId); // don't leave orphan uploads
      throw error;
    }
  }

  /* ---------- Public ---------- */
  findAllActive(): Promise<BrandDocument[]> {
    return this.brandModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findOnePublic(idOrSlug: string): Promise<BrandDocument> {
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const brand = await this.brandModel.findOne({ ...filter, isActive: true }).exec();
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  /* ---------- Admin ---------- */
  async findAllAdmin(query: AdminListQueryDto) {
    const { page, limit, search, isActive } = query;
    const filter: Record<string, any> = {};

    if (search?.trim()) filter.name = new RegExp(escapeRegex(search.trim()), 'i');
    if (isActive !== undefined) filter.isActive = isActive;

    const [data, total] = await Promise.all([
      this.brandModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.brandModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<BrandDocument> {
    if (!isObjectId(id)) throw new NotFoundException('Brand not found');
    const brand = await this.brandModel.findById(id).exec();
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  /* ---------- Update ---------- */
  async update(
    id: string,
    dto: UpdateBrandDto,
    file?: Express.Multer.File,
  ): Promise<BrandDocument> {
    const brand = await this.findById(id);
    const updates = compact(dto);

    if (updates.name && updates.name !== brand.name) {
      await this.ensureNameAvailable(updates.name, id);
      brand.slug = await generateUniqueSlug(this.brandModel, updates.name, id);
    }

    Object.assign(brand, updates);

    let newLogoId: string | undefined;
    let oldLogoId: string | undefined;

    if (file) {
      const newLogo = await this.cloudinary.uploadImage(file, this.folder);
      newLogoId = newLogo.publicId;
      oldLogoId = brand.logo?.publicId;
      brand.logo = newLogo;
    }

    try {
      await brand.save();
    } catch (error) {
      await this.cloudinary.deleteImage(newLogoId);
      throw error;
    }

    await this.cloudinary.deleteImage(oldLogoId); // only after a successful save
    return brand;
  }

  /* ---------- Delete ---------- */
  async remove(id: string) {
    const brand = await this.findById(id);

    const perfumeCount = await this.perfumeModel.countDocuments({ brand: brand._id });
    if (perfumeCount > 0) {
      throw new BadRequestException(
        `Cannot delete "${brand.name}" — ${perfumeCount} perfume(s) still use it. ` +
          'Reassign or delete them first, or deactivate the brand instead.',
      );
    }

    await brand.deleteOne();
    await this.cloudinary.deleteImage(brand.logo?.publicId);
    return { message: 'Brand deleted successfully' };
  }

  /* ---------- Helpers ---------- */
  private async ensureNameAvailable(name: string, excludeId?: string) {
    const existing = await this.brandModel
      .findOne({
        name: name.trim(),
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .collation({ locale: 'en', strength: 2 }) // case-insensitive: "Dior" == "dior"
      .exec();

    if (existing) throw new ConflictException(`Brand "${name}" already exists`);
  }
}