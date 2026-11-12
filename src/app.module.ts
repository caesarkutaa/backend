import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { EventsModule } from './events/events.module';
import { MailModule } from './mail/mail.module';
import { SettingsModule } from './settings/settings.module';
import { RevalidationModule } from './revalidation/revalidation.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { PerfumesModule } from './perfumes/perfumes.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { QrCodeModule } from './qr-code/qr-code.module';
import { AdminModule } from './admin/admin.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    // Global infrastructure
    EventsModule,
    MailModule,
    SettingsModule,
    RevalidationModule,

    // Features
    AuthModule,
    UsersModule,
    BrandsModule,
    CategoriesModule,
    PerfumesModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    CloudinaryModule,
    QrCodeModule,
    AdminModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}