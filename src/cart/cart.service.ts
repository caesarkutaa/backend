import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument, CartItem } from './schemas/cart.schema';
import { Perfume } from '../perfumes/schemas/perfume.schema';
import { Image } from '../common/schemas/image.schema';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { MAX_QUANTITY_PER_ITEM } from './cart.constants';
import { isObjectId } from '../common/utils/object.util';

/* ---------- Shapes ---------- */
interface PopulatedVariant {
  _id: Types.ObjectId;
  size: number;
  price: number;
  compareAtPrice?: number;
  stock: number;
}

interface PopulatedPerfume {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  images: Image[];
  isActive: boolean;
  brand?: { _id: Types.ObjectId; name: string; slug: string } | null;
  variants: PopulatedVariant[];
}

export interface FormattedCartItem {
  _id: Types.ObjectId;
  perfume: {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    image: string | null;
    brand: { _id: Types.ObjectId; name: string; slug: string } | null;
  };
  variant: PopulatedVariant;
  quantity: number;
  inStock: boolean;
  maxQuantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface FormattedCart {
  _id: Types.ObjectId;
  items: FormattedCartItem[];
  summary: {
    itemCount: number;
    totalQuantity: number;
    subtotal: number;
    hasUnavailableItems: boolean;
  };
  /** Human-readable messages about anything auto-changed in the cart */
  notices: string[];
}

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
    @InjectModel(Perfume.name) private readonly perfumeModel: Model<Perfume>,
  ) {}

  /* =====================================================================
   *  READ
   * ===================================================================*/
  async getCart(userId: string): Promise<FormattedCart> {
    const cart = await this.getOrCreateCart(userId);
    return this.formatCart(cart);
  }

  /**
   * Used by Orders before creating an order.
   * Throws if the cart is empty, changed during validation, or has out-of-stock items.
   */
  async getCartForCheckout(userId: string): Promise<FormattedCart> {
    const cart = await this.getCart(userId);

    if (!cart.items.length) {
      throw new BadRequestException('Your cart is empty');
    }

    if (cart.notices.length) {
      throw new BadRequestException({
        message: 'Your cart was updated. Please review it before checking out.',
        notices: cart.notices,
      });
    }

    if (cart.summary.hasUnavailableItems) {
      throw new BadRequestException(
        'Some items in your cart are out of stock. Remove them to continue.',
      );
    }

    return cart;
  }

  /* =====================================================================
   *  ADD
   * ===================================================================*/
  async addItem(userId: string, dto: AddToCartDto): Promise<FormattedCart> {
    const quantity = dto.quantity ?? 1;
    const { perfume, variant } = await this.getAvailableVariant(
      dto.perfumeId,
      dto.variantId,
    );

    const cart = await this.getOrCreateCart(userId);
    const existing = cart.items.find((item) => item.variantId.equals(variant._id));
    const alreadyInCart = existing?.quantity ?? 0;
    const newQuantity = alreadyInCart + quantity;

    this.assertQuantityAllowed(newQuantity, variant.stock, alreadyInCart);

    if (existing) {
      existing.quantity = newQuantity;
    } else {
      cart.items.push({
        perfume: perfume._id,
        variantId: variant._id,
        quantity,
      } as CartItem);
    }

    await cart.save();
    return this.formatCart(cart);
  }

  /* =====================================================================
   *  UPDATE QUANTITY
   * ===================================================================*/
  async updateItemQuantity(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<FormattedCart> {
    const cart = await this.getOrCreateCart(userId);
    const item = isObjectId(itemId) ? cart.items.id(itemId) : null;
    if (!item) throw new NotFoundException('Item not found in your cart');

    const { variant } = await this.getAvailableVariant(
      item.perfume.toString(),
      item.variantId.toString(),
    );

    this.assertQuantityAllowed(quantity, variant.stock);

    item.quantity = quantity;
    await cart.save();
    return this.formatCart(cart);
  }

  /* =====================================================================
   *  REMOVE / CLEAR
   * ===================================================================*/
  async removeItem(userId: string, itemId: string): Promise<FormattedCart> {
    const cart = await this.getOrCreateCart(userId);
    const item = isObjectId(itemId) ? cart.items.id(itemId) : null;
    if (!item) throw new NotFoundException('Item not found in your cart');

    item.deleteOne();
    await cart.save();
    return this.formatCart(cart);
  }

  async clearCart(userId: string): Promise<FormattedCart> {
    const cart = await this.getOrCreateCart(userId);
    cart.set('items', []);
    await cart.save();
    return this.formatCart(cart);
  }

  /* =====================================================================
   *  MERGE GUEST CART  (called by frontend right after login)
   *  Invalid / unavailable lines are skipped silently; quantities are
   *  combined and clamped to stock and the per-item maximum.
   * ===================================================================*/
  async mergeGuestCart(userId: string, dto: MergeCartDto): Promise<FormattedCart> {
    const cart = await this.getOrCreateCart(userId);

    const perfumeIds = [...new Set(dto.items.map((i) => i.perfumeId))];
    const perfumes = await this.perfumeModel
      .find({ _id: { $in: perfumeIds }, isActive: true })
      .select('variants')
      .exec();
    const perfumeMap = new Map(perfumes.map((p) => [p._id.toString(), p]));

    for (const line of dto.items) {
      const perfume = perfumeMap.get(line.perfumeId);
      const variant = perfume?.variants.id(line.variantId);
      if (!perfume || !variant || variant.stock <= 0) continue;

      const limit = Math.min(variant.stock, MAX_QUANTITY_PER_ITEM);
      const existing = cart.items.find((item) => item.variantId.equals(variant._id));
      const combined = (existing?.quantity ?? 0) + (line.quantity ?? 1);
      const finalQuantity = Math.min(combined, limit);

      if (existing) {
        existing.quantity = finalQuantity;
      } else {
        cart.items.push({
          perfume: perfume._id,
          variantId: variant._id,
          quantity: finalQuantity,
        } as CartItem);
      }
    }

    await cart.save();
    return this.formatCart(cart);
  }

  /* =====================================================================
   *  HELPERS
   * ===================================================================*/
  private async getOrCreateCart(userId: string): Promise<CartDocument> {
    const cart = await this.cartModel
      .findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId, items: [] } },
        { upsert: true, new: true },
      )
      .exec();
    return cart!;
  }

  private async getAvailableVariant(perfumeId: string, variantId: string) {
    const perfume = await this.perfumeModel
      .findOne({ _id: perfumeId, isActive: true })
      .select('name variants')
      .exec();
    if (!perfume) throw new NotFoundException('This perfume is no longer available');

    const variant = perfume.variants.id(variantId);
    if (!variant) throw new NotFoundException('The selected size is no longer available');

    if (variant.stock <= 0) {
      throw new BadRequestException(
        `${perfume.name} (${variant.size}ml) is out of stock`,
      );
    }

    return { perfume, variant };
  }

  private assertQuantityAllowed(quantity: number, stock: number, alreadyInCart = 0) {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw new BadRequestException(
        `You can only have up to ${MAX_QUANTITY_PER_ITEM} of this item in your cart`,
      );
    }

    if (quantity > stock) {
      const extra = alreadyInCart ? ` — you already have ${alreadyInCart} in your cart` : '';
      throw new BadRequestException(`Only ${stock} left in stock${extra}`);
    }
  }

  /**
   * Populates live perfume data, removes dead lines, clamps quantities,
   * saves if anything changed, and returns a frontend-ready cart.
   */
  private async formatCart(cart: CartDocument): Promise<FormattedCart> {
    await cart.populate({
      path: 'items.perfume',
      select: 'name slug images variants isActive brand',
      populate: { path: 'brand', select: 'name slug' },
    });

    const notices = new Set<string>();
    const keptItems: Array<{
      _id: Types.ObjectId;
      perfume: Types.ObjectId;
      variantId: Types.ObjectId;
      quantity: number;
    }> = [];
    const items: FormattedCartItem[] = [];
    let changed = false;

    for (const item of cart.items) {
      const perfume = item.perfume as unknown as PopulatedPerfume | null;

      // Perfume deleted or deactivated
      if (!perfume || !perfume.isActive) {
        changed = true;
        notices.add(
          perfume
            ? `"${perfume.name}" is no longer available and was removed from your cart`
            : 'A perfume in your cart is no longer available and was removed',
        );
        continue;
      }

      // Size removed by admin
      const variant = perfume.variants.find((v) => v._id.equals(item.variantId));
      if (!variant) {
        changed = true;
        notices.add(
          `The selected size of "${perfume.name}" is no longer available and was removed`,
        );
        continue;
      }

      // Stock dropped below the cart quantity
      let quantity = item.quantity;
      if (variant.stock > 0 && quantity > variant.stock) {
        quantity = variant.stock;
        changed = true;
        notices.add(
          `Only ${variant.stock} of "${perfume.name}" (${variant.size}ml) left — quantity updated`,
        );
      }

      const inStock = variant.stock > 0;

      keptItems.push({
        _id: item._id,
        perfume: perfume._id,
        variantId: variant._id,
        quantity,
      });

      items.push({
        _id: item._id,
        perfume: {
          _id: perfume._id,
          name: perfume.name,
          slug: perfume.slug,
          image: perfume.images?.[0]?.url ?? null,
          brand: perfume.brand
            ? { _id: perfume.brand._id, name: perfume.brand.name, slug: perfume.brand.slug }
            : null,
        },
        variant: {
          _id: variant._id,
          size: variant.size,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          stock: variant.stock,
        },
        quantity,
        inStock,
        maxQuantity: Math.min(variant.stock, MAX_QUANTITY_PER_ITEM),
        unitPrice: variant.price,
        subtotal: inStock ? variant.price * quantity : 0, // live price, never stored
      });
    }

    if (changed) {
      cart.set('items', keptItems);
      await cart.save();
    }

    return {
      _id: cart._id,
      items,
      summary: {
        itemCount: items.length,
        totalQuantity: items.reduce((sum, i) => sum + (i.inStock ? i.quantity : 0), 0),
        subtotal: items.reduce((sum, i) => sum + i.subtotal, 0),
        hasUnavailableItems: items.some((i) => !i.inStock),
      },
      notices: [...notices],
    };
  }
}