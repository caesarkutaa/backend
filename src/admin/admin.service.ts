import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Order } from '../orders/schemas/order.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { OrdersService } from '../orders/orders.service';
import { LOW_STOCK_THRESHOLD } from '../perfumes/perfumes.service';
import { Role } from '../common/enums/role.enum';
import { OrderStatus, PaymentStatus } from '../common/enums/order.enum';
import { AdminUsersQueryDto, UserSort } from './dto/admin-users-query.dto';
import { AdminPaymentsQueryDto } from './dto/admin-payments-query.dto';
import { escapeRegex, isObjectId } from '../common/utils/object.util';

const USER_SORTS: Record<UserSort, Record<string, 1 | -1>> = {
  [UserSort.NEWEST]: { createdAt: -1, _id: -1 },
  [UserSort.OLDEST]: { createdAt: 1, _id: 1 },
  [UserSort.TOP_SPENDERS]: { totalSpent: -1, _id: 1 },
  [UserSort.MOST_ORDERS]: { orderCount: -1, _id: 1 },
};

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
    private readonly ordersService: OrdersService,
  ) {}

  /* =====================================================================
   *  DASHBOARD — everything the admin home page needs in one call
   * ===================================================================*/
  async getDashboard() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      orderStats,
      totalCustomers,
      blockedUsers,
      newCustomersThisMonth,
      totalPerfumes,
      activePerfumes,
      outOfStock,
      lowStockItems,
      recentOrders,
      awaitingReview,
    ] = await Promise.all([
      this.ordersService.getAdminStats(),
      this.userModel.countDocuments({ role: Role.CUSTOMER }),
      this.userModel.countDocuments({ isActive: false }),
      this.userModel.countDocuments({ role: Role.CUSTOMER, createdAt: { $gte: startOfMonth } }),
      this.perfumeModel.countDocuments(),
      this.perfumeModel.countDocuments({ isActive: true }),
      this.perfumeModel.countDocuments({
        isActive: true,
        variants: { $not: { $elemMatch: { stock: { $gt: 0 } } } },
      }),
      this.perfumeModel
        .aggregate([
          { $match: { isActive: true } },
          { $unwind: '$variants' },
          { $match: { 'variants.stock': { $lte: LOW_STOCK_THRESHOLD } } },
          {
            $project: {
              name: 1,
              slug: 1,
              image: { $arrayElemAt: ['$images.url', 0] },
              variantId: '$variants._id',
              size: '$variants.size',
              stock: '$variants.stock',
            },
          },
          { $sort: { stock: 1 } },
          { $limit: 10 },
        ])
        .exec(),
      this.orderModel
        .find()
        .select('orderNumber total paymentMethod paymentStatus orderStatus createdAt')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .exec(),
      this.orderModel
        .find({ paymentStatus: PaymentStatus.AWAITING_CONFIRMATION })
        .select('orderNumber total createdAt paymentProofs')
        .slice('paymentProofs', -1)
        .populate('user', 'name email')
        .sort({ createdAt: 1 }) // oldest first — review queue
        .limit(5)
        .exec(),
    ]);

    return {
      orders: orderStats,
      users: {
        totalCustomers,
        blockedUsers,
        newCustomersThisMonth,
      },
      perfumes: {
        total: totalPerfumes,
        active: activePerfumes,
        outOfStock,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        lowStockItems,
      },
      recentOrders,
      awaitingReview,
    };
  }

  /* =====================================================================
   *  USERS
   * ===================================================================*/
  async findUsers(query: AdminUsersQueryDto) {
    const { page, limit, search, isActive, role, sort } = query;
    const match: Record<string, any> = {};

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      match.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    if (isActive !== undefined) match.isActive = isActive;
    if (role) match.role = role;

    const sortStage = USER_SORTS[sort ?? UserSort.NEWEST];
    const needsStatsForSort = sort === UserSort.TOP_SPENDERS || sort === UserSort.MOST_ORDERS;

    // aggregate() ignores select:false, so password MUST be projected out here
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $project: { password: 0, __v: 0 } },
    ];

    let dataStages: PipelineStage.FacetPipelineStage[];

    if (needsStatsForSort) {
      // Need order stats on every user before sorting
      pipeline.push(...(this.orderStatsLookup() as PipelineStage[]), { $sort: sortStage });
      dataStages = [{ $skip: (page - 1) * limit }, { $limit: limit }];
    } else {
      // Cheap path: sort + paginate first, then attach stats to just this page
      pipeline.push({ $sort: sortStage });
      dataStages = [
        { $skip: (page - 1) * limit },
        { $limit: limit },
        ...this.orderStatsLookup(),
      ];
    }

    pipeline.push({
      $facet: {
        data: dataStages,
        total: [{ $count: 'count' }],
      },
    });

    const [result] = await this.userModel.aggregate(pipeline).exec();
    const total: number = result?.total?.[0]?.count ?? 0;

    return {
      data: result?.data ?? [],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUserDetail(id: string) {
    const user = await this.findUserOrFail(id);

    const [stats] = await this.orderModel
      .aggregate([
        { $match: { user: user._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            paidOrders: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', PaymentStatus.PAID] }, 1, 0] },
            },
            totalSpent: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$paymentStatus', PaymentStatus.PAID] },
                      { $ne: ['$orderStatus', OrderStatus.CANCELLED] },
                    ],
                  },
                  '$total',
                  0,
                ],
              },
            },
            pendingPayments: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$paymentStatus',
                      [PaymentStatus.PENDING, PaymentStatus.AWAITING_CONFIRMATION],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$orderStatus', OrderStatus.CANCELLED] }, 1, 0] },
            },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
        { $project: { _id: 0 } },
      ])
      .exec();

    const recentOrders = await this.orderModel
      .find({ user: user._id })
      .select('orderNumber total paymentMethod paymentStatus orderStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    return {
      user,
      stats: stats ?? {
        totalOrders: 0,
        paidOrders: 0,
        totalSpent: 0,
        pendingPayments: 0,
        cancelledOrders: 0,
        lastOrderAt: null,
      },
      recentOrders,
    };
  }

  async blockUser(adminId: string, id: string, reason?: string) {
    if (adminId === id) throw new BadRequestException('You cannot block your own account');

    const user = await this.findUserOrFail(id);
    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Admins cannot be blocked. Change their role to customer first.');
    }
    if (!user.isActive) throw new BadRequestException('User is already blocked');

    user.isActive = false;
    user.blockedAt = new Date();
    user.blockedReason = reason;
    user.blockedBy = new Types.ObjectId(adminId);
    await user.save();

    return { message: `${user.name} has been blocked`, user };
  }

  async unblockUser(id: string) {
    const user = await this.findUserOrFail(id);
    if (user.isActive) throw new BadRequestException('User is not blocked');

    user.isActive = true;
    user.blockedAt = undefined;
    user.blockedReason = undefined;
    user.blockedBy = undefined;
    await user.save();

    return { message: `${user.name} has been unblocked`, user };
  }

  async updateRole(adminId: string, id: string, role: Role) {
    if (adminId === id) throw new BadRequestException('You cannot change your own role');

    const user = await this.findUserOrFail(id);
    if (user.role === role) throw new BadRequestException(`User is already ${role}`);
    if (role === Role.ADMIN && !user.isActive) {
      throw new BadRequestException('Unblock this user before making them an admin');
    }

    user.role = role;
    await user.save();

    return { message: `${user.name} is now ${role}`, user };
  }

  /* =====================================================================
   *  PAYMENTS — pending, awaiting confirmation, paid, rejected, refunded
   * ===================================================================*/
  async findPayments(query: AdminPaymentsQueryDto) {
    const { page, limit, search, paymentStatus, paymentMethod } = query;
    const filter: Record<string, any> = {};

    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      const users = await this.userModel
        .find({ $or: [{ email: regex }, { name: regex }] })
        .select('_id')
        .exec();

      filter.$or = [
        { orderNumber: regex },
        { paidReference: regex },
        { paymentReferences: regex },
        { 'paymentProofs.senderName': regex },
        ...(users.length ? [{ user: { $in: users.map((u) => u._id) } }] : []),
      ];
    }

    // Review queue reads oldest first; everything else newest first
    const sort: Record<string, 1 | -1> =
      paymentStatus === PaymentStatus.AWAITING_CONFIRMATION
        ? { createdAt: 1 }
        : { createdAt: -1 };

    const [data, total, summaryRows] = await Promise.all([
      this.orderModel
        .find(filter)
        .select(
          'orderNumber user total paymentMethod paymentStatus orderStatus paidAt ' +
            'paidReference paymentChannel paymentDeadline paymentRejectionReason ' +
            'paymentReviewedBy paymentReviewedAt createdAt paymentProofs',
        )
        .slice('paymentProofs', -1) // latest proof only
        .populate('user', 'name email phone')
        .populate('paymentReviewedBy', 'name')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter),
      this.orderModel
        .aggregate([
          {
            $group: {
              _id: '$paymentStatus',
              count: { $sum: 1 },
              amount: { $sum: '$total' },
            },
          },
        ])
        .exec(),
    ]);

    const summary = Object.fromEntries(
      Object.values(PaymentStatus).map((status) => {
        const row = summaryRows.find((r: any) => r._id === status);
        return [status, { count: row?.count ?? 0, amount: row?.amount ?? 0 }];
      }),
    );

    return {
      data,
      summary,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /* =====================================================================
   *  HELPERS
   * ===================================================================*/
  private async findUserOrFail(id: string) {
    if (!isObjectId(id)) throw new NotFoundException('User not found');
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Attaches orderCount, totalSpent (paid, not cancelled) and lastOrderAt to each user */
  private orderStatsLookup(): PipelineStage.FacetPipelineStage[] {
    return [
      {
        $lookup: {
          from: this.orderModel.collection.name,
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$user', '$$uid'] } } },
            {
              $group: {
                _id: null,
                orderCount: { $sum: 1 },
                totalSpent: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$paymentStatus', PaymentStatus.PAID] },
                          { $ne: ['$orderStatus', OrderStatus.CANCELLED] },
                        ],
                      },
                      '$total',
                      0,
                    ],
                  },
                },
                lastOrderAt: { $max: '$createdAt' },
              },
            },
          ],
          as: 'orderStats',
        },
      },
      {
        $addFields: {
          orderCount: { $ifNull: [{ $first: '$orderStats.orderCount' }, 0] },
          totalSpent: { $ifNull: [{ $first: '$orderStats.totalSpent' }, 0] },
          lastOrderAt: { $first: '$orderStats.lastOrderAt' },
        },
      },
      { $project: { orderStats: 0 } },
    ];
  }
}