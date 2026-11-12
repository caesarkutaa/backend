import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Perfume, PerfumeDocument } from './schemas/perfume.schema';
import { Brand, BrandDocument } from '../brands/schemas/brand.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Cart } from '../cart/schemas/cart.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { QrCodeService } from '../qr-code/qr-code.service';
import { Image } from '../common/schemas/image.schema';
import { CreatePerfumeDto } from './dto/create-perfume.dto';
import { UpdatePerfumeDto } from './dto/update-perfume.dto';
import { VariantDto } from './dto/variant.dto';
import { PerfumeQueryDto, PerfumeSort } from './dto/perfume-query.dto';
import { AdminPerfumeQueryDto } from './dto/admin-perfume-query.dto';
import { generateUniqueSlug } from '../common/utils/slug.util';
import { compact, escapeRegex, isObjectId } from '../common/utils/object.util';

export const MAX_PERFUME_IMAGES = 10;
export const LOW_STOCK_THRESHOLD = 5;

const SORT_STAGES: Record<PerfumeSort, Record<string, 1 | -1>> = {
  [PerfumeSort.NEWEST]: { createdAt: -1, _id: -1 },
  [PerfumeSort.FEATURED]: { isFeatured: -1, createdAt: -1, _id: -1 },
  [PerfumeSort.PRICE_ASC]: { minPrice: 1, _id: 1 },
  [PerfumeSort.PRICE_DESC]: { minPrice: -1, _id: 1 },
  [PerfumeSort.NAME_ASC]: { name: 1, _id: 1 },
  [PerfumeSort.BEST_SELLING]: { totalSold: -1, createdAt: -1, _id: -1 },
  [PerfumeSort.TOP_RATED]: { ratingAverage: -1, ratingCount: -1, _id: -1 },
};

@Injectable()
export class PerfumesService {
  private readonly imageFolder = 'perfumes';

  constructor(
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
    private readonly cloudinary: CloudinaryService,
    private readonly qrCode: QrCodeService,
  ) {}

  /* =====================================================================
   *  CREATE  (images + automatic QR code)
   * ===================================================================*/
  async create(dto: CreatePerfumeDto, files: Express.Multer.File[], userId: string) {
    if (!files?.length) {
      throw new BadRequestException('Upload at least one perfume image');
    }

    const brand = await this.getBrandOrFail(dto.brand);
    await this.getCategoryOrFail(dto.category);
    this.assertValidVariants(dto.variants);

    const slug = await generateUniqueSlug(this.perfumeModel, `${brand.name} ${dto.name}`);
    const variants = this.normalizeVariants(dto.variants, slug);

    const [images, qrCode] = await Promise.all([
      this.cloudinary.uploadImages(files, this.imageFolder),
      this.qrCode.generateForPerfume(slug),
    ]);

    try {
      const perfume = await this.perfumeModel.create({
        ...compact(dto),
        slug,
        variants,
        images,
        qrCode,
        createdBy: userId,
      });
      return this.findOneAdmin(perfume._id.toString());
    } catch (error) {
      await this.cloudinary.deleteImages([...images.map((img) => img.publicId), qrCode.publicId]);
      throw error;
    }
  }

  /* =====================================================================
   *  PUBLIC GALLERY
   * ===================================================================*/
  async findGallery(query: PerfumeQueryDto) {
    const { page, limit, search, sort } = query;
    const match: Record<string, any> = { isActive: true };

    if (query.brand) {
      const slugs = this.splitList(query.brand);
      const brands = await this.brandModel.find({ slug: { $in: slugs }, isActive: true }).select('_id').exec();
      if (!brands.length) return this.emptyPage(page, limit);
      match.brand = { $in: brands.map((b) => b._id) };
    }

    if (query.category) {
      const slugs = this.splitList(query.category);
      const categories = await this.categoryModel.find({ slug: { $in: slugs }, isActive: true }).select('_id').exec();
      if (!categories.length) return this.emptyPage(page, limit);
      match.category = { $in: categories.map((c) => c._id) };
    }

    if (query.gender) match.gender = query.gender;
    if (query.concentration) match.concentration = query.concentration;
    if (query.featured !== undefined) match.isFeatured = query.featured;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const price: Record<string, number> = {};
      if (query.minPrice !== undefined) price.$gte = query.minPrice;
      if (query.maxPrice !== undefined) price.$lte = query.maxPrice;
      match.variants = { $elemMatch: { price } };
    }

    if (search?.trim()) {
      const pattern = escapeRegex(search.trim());
      const regex = { $regex: pattern, $options: 'i' };
      const matchingBrands = await this.brandModel.find({ name: new RegExp(pattern, 'i') }).select('_id').exec();

      match.$or = [
        { name: regex },
        { fragranceFamily: regex },
        { 'notes.top': regex },
        { 'notes.middle': regex },
        { 'notes.base': regex },
        ...(matchingBrands.length ? [{ brand: { $in: matchingBrands.map((b) => b._id) } }] : []),
      ];
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $addFields: {
          minPrice: { $min: '$variants.price' },
          maxPrice: { $max: '$variants.price' },
          totalStock: { $sum: '$variants.stock' },
        },
      },
      ...(query.inStock ? [{ $match: { totalStock: { $gt: 0 } } }] : []),
      { $sort: SORT_STAGES[sort ?? PerfumeSort.NEWEST] },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: this.brandModel.collection.name,
                localField: 'brand',
                foreignField: '_id',
                as: 'brand',
                pipeline: [{ $project: { name: 1, slug: 1, logo: 1 } }],
              },
            },
            { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: this.categoryModel.collection.name,
                localField: 'category',
                foreignField: '_id',
                as: 'category',
                pipeline: [{ $project: { name: 1, slug: 1 } }],
              },
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                name: 1,
                slug: 1,
                brand: 1,
                category: 1,
                gender: 1,
                concentration: 1,
                shortDescription: 1,
                fragranceFamily: 1,
                isFeatured: 1,
                totalSold: 1,
                ratingAverage: 1,
                ratingCount: 1,
                createdAt: 1,
                images: { $slice: ['$images', 2] },
                'variants._id': 1,
                'variants.size': 1,
                'variants.price': 1,
                'variants.compareAtPrice': 1,
                'variants.stock': 1,
                minPrice: 1,
                maxPrice: 1,
                totalStock: 1,
                inStock: { $gt: ['$totalStock', 0] },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.perfumeModel.aggregate(pipeline).exec();
    const total: number = result?.total?.[0]?.count ?? 0;

    return {
      data: result?.data ?? [],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /* =====================================================================
   *  PUBLIC DETAIL
   * ===================================================================*/
  async findBySlug(slug: string): Promise<PerfumeDocument> {
    const perfume = await this.perfumeModel
      .findOne({ slug: slug.toLowerCase(), isActive: true })
      .select('-qrCode -createdBy')
      .populate('brand', 'name slug logo description')
      .populate('category', 'name slug')
      .exec();

    if (!perfume) throw new NotFoundException('Perfume not found');
    return perfume;
  }

  async findRelated(slug: string, limit = 4): Promise<PerfumeDocument[]> {
    const perfume = await this.perfumeModel
      .findOne({ slug: slug.toLowerCase(), isActive: true })
      .select('_id brand category')
      .exec();
    if (!perfume) throw new NotFoundException('Perfume not found');

    return this.perfumeModel
      .find({
        _id: { $ne: perfume._id },
        isActive: true,
        $or: [{ category: perfume.category }, { brand: perfume.brand }],
      })
      .select('name slug brand gender concentration images variants isFeatured ratingAverage ratingCount')
      .populate('brand', 'name slug')
      .sort({ totalSold: -1, createdAt: -1 })
      .limit(Math.min(limit, 12))
      .exec();
  }

  /* =====================================================================
   *  ADMIN
   * ===================================================================*/
  async findAllAdmin(query: AdminPerfumeQueryDto) {
    const { page, limit, search, isActive, brand, category, lowStock } = query;
    const filter: Record<string, any> = {};

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ name: regex }, { slug: regex }, { 'variants.sku': regex }];
    }
    if (isActive !== undefined) filter.isActive = isActive;
    if (brand) filter.brand = brand;
    if (category) filter.category = category;
    if (lowStock) {
      filter.variants = { $elemMatch: { stock: { $lte: LOW_STOCK_THRESHOLD } } };
    }

    const [data, total] = await Promise.all([
      this.perfumeModel
        .find(filter)
        .select('-description')
        .populate('brand', 'name slug')
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.perfumeModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<PerfumeDocument> {
    if (!isObjectId(id)) throw new NotFoundException('Perfume not found');
    const perfume = await this.perfumeModel.findById(id).exec();
    if (!perfume) throw new NotFoundException('Perfume not found');
    return perfume;
  }

  async findOneAdmin(id: string) {
    if (!isObjectId(id)) throw new NotFoundException('Perfume not found');
    const perfume = await this.perfumeModel
      .findById(id)
      .populate('brand', 'name slug')
      .populate('category', 'name slug')
      .populate('createdBy', 'name email')
      .exec();
    if (!perfume) throw new NotFoundException('Perfume not found');
    return this.withQrInfo(perfume);
  }

  /* =====================================================================
   *  UPDATE  (slug is intentionally NOT changed)
   * ===================================================================*/
  async update(id: string, dto: UpdatePerfumeDto) {
    const perfume = await this.findById(id);
    const updates = compact(dto);

    if (updates.brand) await this.getBrandOrFail(updates.brand);
    if (updates.category) await this.getCategoryOrFail(updates.category);

    if (updates.variants) {
      this.assertValidVariants(updates.variants);
      perfume.set('variants', this.normalizeVariants(updates.variants, perfume.slug));
      delete updates.variants;
    }

    if (updates.notes) {
      perfume.set('notes', updates.notes);
      delete updates.notes;
    }

    perfume.set(updates);
    await perfume.save();
    return this.findOneAdmin(id);
  }

  /* =====================================================================
   *  IMAGE MANAGEMENT
   * ===================================================================*/
  async addImages(id: string, files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No images uploaded');

    const perfume = await this.findById(id);
    if (perfume.images.length + files.length > MAX_PERFUME_IMAGES) {
      throw new BadRequestException(
        `A perfume can have at most ${MAX_PERFUME_IMAGES} images (currently ${perfume.images.length})`,
      );
    }

    const uploaded = await this.cloudinary.uploadImages(files, this.imageFolder);

    try {
      perfume.set('images', [...this.plainImages(perfume.images), ...uploaded]);
      await perfume.save();
    } catch (error) {
      await this.cloudinary.deleteImages(uploaded.map((img) => img.publicId));
      throw error;
    }

    return this.findOneAdmin(id);
  }

  async removeImage(id: string, publicId: string) {
    if (!publicId) throw new BadRequestException('publicId is required');

    const perfume = await this.findById(id);
    const exists = perfume.images.some((img) => img.publicId === publicId);
    if (!exists) throw new NotFoundException('Image not found on this perfume');

    if (perfume.images.length <= 1) {
      throw new BadRequestException('A perfume must keep at least one image. Upload a new one before removing this.');
    }

    perfume.set('images', this.plainImages(perfume.images).filter((img) => img.publicId !== publicId));
    await perfume.save();
    await this.cloudinary.deleteImage(publicId);

    return this.findOneAdmin(id);
  }

  async reorderImages(id: string, publicIds: string[]) {
    const perfume = await this.findById(id);
    const current = this.plainImages(perfume.images);
    const currentIds = current.map((img) => img.publicId);

    const sameSet =
      publicIds.length === currentIds.length &&
      new Set(publicIds).size === publicIds.length &&
      publicIds.every((pid) => currentIds.includes(pid));

    if (!sameSet) throw new BadRequestException('publicIds must contain exactly the current images');

    const byId = new Map(current.map((img) => [img.publicId, img]));
    perfume.set('images', publicIds.map((pid) => byId.get(pid)));
    await perfume.save();

    return this.findOneAdmin(id);
  }

  /* =====================================================================
   *  QR CODE
   * ===================================================================*/
  async getQrCode(id: string) {
    const perfume = await this.findById(id);
    if (!perfume.qrCode?.url) {
      perfume.qrCode = await this.qrCode.generateForPerfume(perfume.slug);
      await perfume.save();
    }
    return this.qrInfo(perfume);
  }

  async getQrSvg(id: string) {
    const perfume = await this.findById(id);
    const svg = await this.qrCode.generateSvg(this.qrCode.buildPerfumeUrl(perfume.slug));
    return { fileName: `qr-${perfume.slug}`, svg };
  }

  async regenerateQrCode(id: string) {
    const perfume = await this.findById(id);
    perfume.qrCode = await this.qrCode.generateForPerfume(perfume.slug);
    await perfume.save();
    return this.qrInfo(perfume);
  }

  /* =====================================================================
   *  DELETE
   * ===================================================================*/
  async remove(id: string) {
    const perfume = await this.findById(id);
    const publicIds = [...perfume.images.map((img) => img.publicId), perfume.qrCode?.publicId];

    await perfume.deleteOne();
    await this.cartModel.updateMany(
      { 'items.perfume': perfume._id },
      { $pull: { items: { perfume: perfume._id } } },
    );
    await this.cloudinary.deleteImages(publicIds);

    return {
      message: `"${perfume.name}" deleted. Any printed QR stickers for it will now show "not found".`,
    };
  }

  /* =====================================================================
   *  HELPERS
   * ===================================================================*/
  private async getBrandOrFail(id: string): Promise<BrandDocument> {
    if (!isObjectId(id)) throw new BadRequestException('Please select a valid brand');
    const brand = await this.brandModel.findById(id).exec();
    if (!brand) throw new BadRequestException('Selected brand does not exist');
    return brand;
  }

  private async getCategoryOrFail(id: string): Promise<CategoryDocument> {
    if (!isObjectId(id)) throw new BadRequestException('Please select a valid category');
    const category = await this.categoryModel.findById(id).exec();
    if (!category) throw new BadRequestException('Selected category does not exist');
    return category;
  }

  private assertValidVariants(variants: VariantDto[]) {
    const sizes = variants.map((v) => v.size);
    if (new Set(sizes).size !== sizes.length) {
      throw new BadRequestException('Each variant must have a different size');
    }
    for (const v of variants) {
      if (v.compareAtPrice !== undefined && v.compareAtPrice <= v.price) {
        throw new BadRequestException(`compareAtPrice for ${v.size}ml must be higher than its price`);
      }
    }
  }

  private normalizeVariants(variants: VariantDto[], slug: string) {
    return variants.map((v) => ({
      ...(v._id ? { _id: new Types.ObjectId(v._id) } : {}),
      size: v.size,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      sku: v.sku?.trim() || `${slug}-${v.size}ml`.toUpperCase(),
    }));
  }

  private plainImages(images: Image[]): Image[] {
    return images.map((img) => ({ url: img.url, publicId: img.publicId }));
  }

  private qrInfo(perfume: PerfumeDocument) {
    return {
      qrCode: perfume.qrCode,
      link: this.qrCode.buildPerfumeUrl(perfume.slug),
      downloadUrl: perfume.qrCode ? this.qrCode.getDownloadUrl(perfume.qrCode, `qr-${perfume.slug}`) : null,
    };
  }

  private withQrInfo(perfume: PerfumeDocument) {
    const info = this.qrInfo(perfume);
    return { ...perfume.toJSON(), qrLink: info.link, qrDownloadUrl: info.downloadUrl };
  }

  private splitList(value: string): string[] {
    return value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }

  private emptyPage(page: number, limit: number) {
    return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
  }
}