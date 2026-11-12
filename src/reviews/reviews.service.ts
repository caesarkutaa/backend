import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { Order } from '../orders/schemas/order.schema';
import { User } from '../users/schemas/user.schema';
import { OrderStatus } from '../common/enums/order.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { compact, escapeRegex, isObjectId } from '../common/utils/object.util';

const PUBLIC_SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
};

/** "Kuta Okeke Louis" -> "Kuta L." */
const displayName = (name?: string) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  /* =====================================================================
   *  PUBLIC
   * ===================================================================*/
  async findForPerfume(perfumeId: string, query: ReviewQueryDto) {
    if (!isObjectId(perfumeId)) throw new NotFoundException('Perfume not found');
    const pid = new Types.ObjectId(perfumeId);
    const { page, limit } = query;

    const filter: Record<string, any> = { perfume: pid, isHidden: false };
    if (query.rating) filter.rating = query.rating;

    const [data, total, breakdownRows] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('user', 'name')
        .sort(PUBLIC_SORTS[query.sort ?? 'newest'])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.reviewModel.countDocuments(filter),
      this.reviewModel
        .aggregate([
          { $match: { perfume: pid, isHidden: false } },
          { $group: { _id: '$rating', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownRows.forEach((row: { _id: number; count: number }) => (breakdown[row._id] = row.count));
    const count = Object.values(breakdown).reduce((s, c) => s + c, 0);
    const sum = Object.entries(breakdown).reduce((s, [r, c]) => s + Number(r) * c, 0);

    return {
      data: data.map((r) => ({
        _id: r._id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        authorName: displayName((r.user as unknown as { name?: string } | null)?.name),
        verified: true,
        adminReply: r.adminReply ? { text: r.adminReply.text, at: r.adminReply.at } : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, breakdown },
    };
  }

  /* =====================================================================
   *  CUSTOMER
   * ===================================================================*/
  async getEligibility(userId: string, perfumeId: string) {
    if (!isObjectId(perfumeId)) throw new NotFoundException('Perfume not found');

    const existing = await this.reviewModel.findOne({ user: userId, perfume: perfumeId }).lean().exec();
    if (existing) {
      return {
        canReview: false,
        hasReviewed: true,
        review: {
          _id: existing._id,
          rating: existing.rating,
          title: existing.title,
          comment: existing.comment,
          isHidden: existing.isHidden,
        },
      };
    }

    const order = await this.findDeliveredOrder(userId, perfumeId);
    return order
      ? { canReview: true, hasReviewed: false }
      : {
          canReview: false,
          hasReviewed: false,
          reason: 'Only customers who have received this perfume can review it.',
        };
  }

  async create(userId: string, dto: CreateReviewDto): Promise<ReviewDocument> {
    const perfumeExists = await this.perfumeModel.exists({ _id: dto.perfumeId });
    if (!perfumeExists) throw new NotFoundException('Perfume not found');

    const order = await this.findDeliveredOrder(userId, dto.perfumeId);
    if (!order) {
      throw new ForbiddenException('You can review this perfume once an order containing it has been delivered.');
    }

    const already = await this.reviewModel.exists({ user: userId, perfume: dto.perfumeId });
    if (already) {
      throw new ConflictException('You have already reviewed this perfume. You can edit your review instead.');
    }

    const review = await this.reviewModel.create({
      perfume: dto.perfumeId,
      user: userId,
      order: order._id,
      rating: dto.rating,
      title: dto.title || undefined,
      comment: dto.comment,
    });

    await this.recalculate(dto.perfumeId);
    return review;
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto): Promise<ReviewDocument> {
    const review = await this.findOwn(userId, reviewId);
    review.set(compact(dto));
    await review.save();
    await this.recalculate(review.perfume);
    return review;
  }

  async remove(userId: string, reviewId: string) {
    const review = await this.findOwn(userId, reviewId);
    await review.deleteOne();
    await this.recalculate(review.perfume);
    return { message: 'Your review was deleted' };
  }

  /* =====================================================================
   *  ADMIN
   * ===================================================================*/
  async findAllAdmin(query: AdminReviewQueryDto) {
    const { page, limit, search, rating, visibility } = query;
    const filter: Record<string, any> = {};

    if (rating) filter.rating = rating;
    if (visibility) filter.isHidden = visibility === 'hidden';

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      const [perfumes, users] = await Promise.all([
        this.perfumeModel.find({ name: regex }).select('_id').lean().exec(),
        this.userModel.find({ $or: [{ name: regex }, { email: regex }] }).select('_id').lean().exec(),
      ]);
      filter.$or = [
        { comment: regex },
        { title: regex },
        ...(perfumes.length ? [{ perfume: { $in: perfumes.map((p) => p._id) } }] : []),
        ...(users.length ? [{ user: { $in: users.map((u) => u._id) } }] : []),
      ];
    }

    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('perfume', 'name slug images')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async setVisibility(reviewId: string, dto: ModerateReviewDto) {
    const review = await this.findById(reviewId);
    review.isHidden = dto.isHidden;
    review.hiddenReason = dto.isHidden ? dto.reason || undefined : undefined;
    await review.save();
    await this.recalculate(review.perfume);
    return this.findAdminView(review._id);
  }

  async reply(adminId: string, reviewId: string, text: string) {
    const review = await this.findById(reviewId);
    review.adminReply = text.trim()
      ? { text: text.trim(), at: new Date(), by: new Types.ObjectId(adminId) }
      : undefined;
    await review.save();
    return this.findAdminView(review._id);
  }

  async adminRemove(reviewId: string) {
    const review = await this.findById(reviewId);
    await review.deleteOne();
    await this.recalculate(review.perfume);
    return { message: 'Review deleted' };
  }

  /* =====================================================================
   *  HELPERS
   * ===================================================================*/
  private findDeliveredOrder(userId: string, perfumeId: string) {
    return this.orderModel
      .findOne({ user: userId, orderStatus: OrderStatus.DELIVERED, 'items.perfume': perfumeId })
      .select('_id')
      .sort({ deliveredAt: -1 })
      .lean()
      .exec();
  }

  private async findOwn(userId: string, reviewId: string): Promise<ReviewDocument> {
    if (!isObjectId(reviewId)) throw new NotFoundException('Review not found');
    const review = await this.reviewModel.findOne({ _id: reviewId, user: userId }).exec();
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private async findById(reviewId: string): Promise<ReviewDocument> {
    if (!isObjectId(reviewId)) throw new NotFoundException('Review not found');
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private findAdminView(id: Types.ObjectId) {
    return this.reviewModel
      .findById(id)
      .populate('perfume', 'name slug images')
      .populate('user', 'name email')
      .lean()
      .exec();
  }

  /** Keeps Perfume.ratingAverage / ratingCount in sync (visible reviews only) */
  private async recalculate(perfumeId: string | Types.ObjectId) {
    const pid = new Types.ObjectId(String(perfumeId));
    const [stats] = await this.reviewModel
      .aggregate([
        { $match: { perfume: pid, isHidden: false } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ])
      .exec();

    await this.perfumeModel.updateOne(
      { _id: pid },
      {
        $set: {
          ratingAverage: stats ? Math.round(stats.avg * 10) / 10 : 0,
          ratingCount: stats?.count ?? 0,
        },
      },
    );
  }
}