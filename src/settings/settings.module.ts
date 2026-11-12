import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StoreSettings, StoreSettingsSchema } from './schemas/store-settings.schema';

/** Global: Orders (delivery fees) and others can inject SettingsService */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: StoreSettings.name, schema: StoreSettingsSchema }])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}