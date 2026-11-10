import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminListQueryDto } from '../common/dto/admin-list-query.dto';
import { generateUniqueSlug } from '../common/utils/slug.util';
import { compact, escapeRegex, isObjectId } from '../common/utils/object.util';

@Injectable()
export class CategoriesService {
  private readonly folder = 'categories';

  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ---------- Create ---------- */
  async create(
    dto: CreateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<CategoryDocument> {
    await this.ensureNameAvailable(dto.name);
    const slug = await generateUniqueSlug(this.categoryModel, dto.name);
    const image = file ? await this.cloudinary.uploadImage(file, this.folder) : undefined;

    try {
      return await this.categoryModel.create({ ...compact(dto), slug, image });
    } catch (error) {
      await this.cloudinary.deleteImage(image?.publicId);
      throw error;
    }
  }

  /* ---------- Public ---------- */
  findAllActive(): Promise<CategoryDocument[]> {
    return this.categoryModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findOnePublic(idOrSlug: string): Promise<CategoryDocument> {
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const category = await this.categoryModel
      .findOne({ ...filter, isActive: true })
      .exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /* ---------- Admin ---------- */
  async findAllAdmin(query: AdminListQueryDto) {
    const { page, limit, search, isActive } = query;
    const filter: Record<string, any> = {};

    if (search?.trim()) filter.name = new RegExp(escapeRegex(search.trim()), 'i');
    if (isActive !== undefined) filter.isActive = isActive;

    const [data, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.categoryModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<CategoryDocument> {
    if (!isObjectId(id)) throw new NotFoundException('Category not found');
    const category = await this.categoryModel.findById(id).exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /* ---------- Update ---------- */
  async update(
    id: string,
    dto: UpdateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<CategoryDocument> {
    const category = await this.findById(id);
    const updates = compact(dto);

    if (updates.name && updates.name !== category.name) {
      await this.ensureNameAvailable(updates.name, id);
      category.slug = await generateUniqueSlug(this.categoryModel, updates.name, id);
    }

    Object.assign(category, updates);

    let newImageId: string | undefined;
    let oldImageId: string | undefined;

    if (file) {
      const newImage = await this.cloudinary.uploadImage(file, this.folder);
      newImageId = newImage.publicId;
      oldImageId = category.image?.publicId;
      category.image = newImage;
    }

    try {
      await category.save();
    } catch (error) {
      await this.cloudinary.deleteImage(newImageId);
      throw error;
    }

    await this.cloudinary.deleteImage(oldImageId);
    return category;
  }

  /* ---------- Delete ---------- */
  async remove(id: string) {
    const category = await this.findById(id);

    const perfumeCount = await this.perfumeModel.countDocuments({
      category: category._id,
    });
    if (perfumeCount > 0) {
      throw new BadRequestException(
        `Cannot delete "${category.name}" — ${perfumeCount} perfume(s) still use it. ` +
          'Reassign or delete them first, or deactivate the category instead.',
      );
    }

    await category.deleteOne();
    await this.cloudinary.deleteImage(category.image?.publicId);
    return { message: 'Category deleted successfully' };
  }

  /* ---------- Helpers ---------- */
  private async ensureNameAvailable(name: string, excludeId?: string) {
    const existing = await this.categoryModel
      .findOne({
        name: name.trim(),
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .collation({ locale: 'en', strength: 2 })
      .exec();

    if (existing) throw new ConflictException(`Category "${name}" already exists`);
  }
}