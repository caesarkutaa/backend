import { Module } from '@nestjs/common';
import { QrCodeService } from './qr-code.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  providers: [QrCodeService],
  exports: [QrCodeService],
})
export class QrCodeModule {}