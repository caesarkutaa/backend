import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Image } from '../common/schemas/image.schema';

@Injectable()
export class QrCodeService {
  private readonly frontendUrl: string;

  constructor(
    config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.frontendUrl = config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, ''); // strip trailing slash
  }

  /** The exact link encoded inside the QR */
  buildPerfumeUrl(slug: string): string {
    return `${this.frontendUrl}/perfumes/${slug}`;
  }

  /** High-res PNG, high error correction (survives scratches/curved bottles) */
  generatePngBuffer(text: string): Promise<Buffer> {
    return QRCode.toBuffer(text, {
      type: 'png',
      errorCorrectionLevel: 'H',
      width: 1024,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  /** SVG version — infinitely scalable for professional sticker printing */
  generateSvg(text: string): Promise<string> {
    return QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
    });
  }

  /**
   * Generates the QR for a perfume and stores it on Cloudinary.
   * Same slug -> same public_id -> overwrites instead of piling up files.
   */
  async generateForPerfume(slug: string): Promise<Image> {
    const buffer = await this.generatePngBuffer(this.buildPerfumeUrl(slug));
    return this.cloudinary.uploadBuffer(buffer, 'qrcodes', {
      public_id: `qr-${slug}`,
      overwrite: true,
      invalidate: true,
      format: 'png',
    });
  }

  /** Cloudinary URL that forces a file download instead of opening in a tab */
  getDownloadUrl(qrCode: Image, fileName: string): string {
    return qrCode.url.replace('/upload/', `/upload/fl_attachment:${fileName}/`);
  }
}