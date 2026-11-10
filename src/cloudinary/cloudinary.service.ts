import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { Image } from '../common/schemas/image.schema';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly rootFolder: string;

  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    this.rootFolder = config.get<string>('CLOUDINARY_FOLDER', 'perfume-store');
  }

  /** Upload a raw buffer (used for multer files AND generated QR PNGs) */
  uploadBuffer(
    buffer: Buffer,
    folder: string,
    options: UploadApiOptions = {},
  ): Promise<Image> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${this.rootFolder}/${folder}`,
          resource_type: 'image',
          ...options,
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            this.logger.error(`Upload failed: ${error?.message}`);
            return reject(
              new InternalServerErrorException('Image upload failed, please try again'),
            );
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  uploadImage(file: Express.Multer.File, folder: string): Promise<Image> {
    return this.uploadBuffer(file.buffer, folder);
  }

  uploadImages(files: Express.Multer.File[], folder: string): Promise<Image[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, folder)));
  }

  /** Never throws — a failed cleanup should not break the main request */
  async deleteImage(publicId?: string | null): Promise<void> {
    if (!publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
    } catch (error: any) {
      this.logger.warn(`Could not delete ${publicId}: ${error?.message}`);
    }
  }

  async deleteImages(publicIds: (string | undefined | null)[]): Promise<void> {
    await Promise.all(publicIds.map((id) => this.deleteImage(id)));
  }
}