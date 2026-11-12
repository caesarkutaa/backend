import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoreSettings, StoreSettingsDocument } from './schemas/store-settings.schema';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** Turns { delivery: { defaultFee: 1 } } into { 'delivery.defaultFee': 1 } so partial updates don't wipe siblings */
function toSetPaths(obj: Record<string, any>, prefix = ''): Record<string, any> {
  return Object.entries(obj).reduce<Record<string, any>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(acc, toSetPaths(value, path));
    } else {
      acc[path] = value;
    }
    return acc;
  }, {});
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: StoreSettingsDocument | null = null;

  constructor(
    @InjectModel(StoreSettings.name) private readonly model: Model<StoreSettings>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.get();
  }

  /** Cached single settings document (created on first run from .env defaults) */
  async get(): Promise<StoreSettingsDocument> {
    if (this.cache) return this.cache;

    let settings = await this.model.findOne({ key: 'main' }).exec();
    if (!settings) {
      settings = await this.model.create({
        key: 'main',
        delivery: {
          defaultFee: Number(this.config.get('SHIPPING_FEE') ?? 0),
          freeShippingMin: Number(this.config.get('FREE_SHIPPING_MIN') ?? 0),
        },
      });
      this.logger.log('Store settings created with defaults');
    }

    this.cache = settings;
    return settings;
  }

  /** What the storefront is allowed to see */
  async getPublic() {
    const s = (await this.get()).toObject();
    return {
      announcement: s.announcement?.enabled ? s.announcement.text : null,
      whatsapp:
        s.whatsapp?.enabled && s.whatsapp.number
          ? { number: s.whatsapp.number, message: s.whatsapp.message }
          : null,
      contact: s.contact ?? {},
      delivery: {
        defaultFee: s.delivery?.defaultFee ?? 0,
        freeShippingMin: s.delivery?.freeShippingMin ?? 0,
        stateFees: s.delivery?.stateFees ?? [],
        estimatedDays: s.delivery?.estimatedDays ?? '',
      },
    };
  }

  async update(dto: UpdateSettingsDto): Promise<StoreSettingsDocument> {
    // One fee per state (last one wins)
    if (dto.delivery?.stateFees) {
      const byState = new Map<string, { state: string; fee: number }>();
      dto.delivery.stateFees.forEach((f) => byState.set(f.state.toLowerCase(), { state: f.state, fee: f.fee }));
      dto.delivery.stateFees = [...byState.values()];
    }

    const updated = await this.model
      .findOneAndUpdate(
        { key: 'main' },
        { $set: toSetPaths(JSON.parse(JSON.stringify(dto))) },
        {  returnDocument: 'after' , upsert: true, runValidators: true },
      )
      .exec();

    this.cache = updated;
    return updated;
  }

  /** Source of truth for delivery pricing (used by checkout) */
  async calculateShippingFee(state: string | undefined, subtotal: number): Promise<number> {
    const { delivery } = await this.get();
    if (delivery.freeShippingMin > 0 && subtotal >= delivery.freeShippingMin) return 0;

    const match = delivery.stateFees.find(
      (f) => f.state.toLowerCase() === (state ?? '').trim().toLowerCase(),
    );
    return match ? match.fee : delivery.defaultFee;
  }
}