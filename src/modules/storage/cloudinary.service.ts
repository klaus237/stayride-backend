import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { Readable } from "stream";

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format: string;
  bytes: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get("CLOUDINARY_CLOUD_NAME"),
      api_key: this.configService.get("CLOUDINARY_API_KEY"),
      api_secret: this.configService.get("CLOUDINARY_API_SECRET"),
      secure: true,
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    options?: {
      width?: number;
      height?: number;
      quality?: number;
      publicId?: string;
    },
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `stayride/${folder}`,
          public_id: options?.publicId,
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(new BadRequestException("Erreur upload"));
          }
          resolve({
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        },
      );
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(stream);
    });
  }

  async uploadDocument(
    buffer: Buffer,
    userId: string,
    docType: string,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `stayride/kyc/${userId}`,
          public_id: `${docType}_${Date.now()}`,
          resource_type: "image",
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(new BadRequestException("Erreur upload document"));
          }
          resolve({
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            format: result.format,
            bytes: result.bytes,
          });
        },
      );
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(stream);
    });
  }

  async uploadThumbnail(buffer: Buffer, folder: string): Promise<UploadResult> {
    return this.uploadBuffer(buffer, folder, { width: 400, height: 400 });
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err: any) {
      this.logger.error(`Erreur: ${err.message}`);
    }
  }

  getTransformedUrl(publicId: string): string {
    return cloudinary.url(publicId, { secure: true });
  }

  getThumbnailUrl(publicId: string): string {
    return this.getTransformedUrl(publicId);
  }

  getCoverUrl(publicId: string): string {
    return this.getTransformedUrl(publicId);
  }
}
