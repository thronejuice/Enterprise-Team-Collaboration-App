import { Injectable, Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { StorageService } from '../recordings/storage.service';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE = 256;

/** Detects the real format from magic bytes; the file name and Content-Type are never trusted. */
export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

/** Avatars live under avatars/<userId>/ in the recordings bucket; objects are only ever written by the API. */
export const avatarKeyFor = (userId: string) => `avatars/${userId}/${randomBytes(12).toString('hex')}.webp`;

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(private readonly storage: StorageService) {}

  /** Crops to a square, scales to 256×256, re-encodes as WebP. The output has no EXIF/GPS metadata. */
  async normalize(input: Buffer): Promise<Buffer> {
    if (!sniffImageType(input)) {
      throw new UnsupportedMediaTypeException('Avatar must be a JPG, PNG or WebP image.');
    }
    try {
      return await sharp(input, { failOn: 'error' })
        .rotate() // apply EXIF orientation before the metadata is dropped
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
        .webp()
        .toBuffer();
    } catch {
      throw new UnsupportedMediaTypeException('Avatar could not be read as an image.');
    }
  }

  async upload(userId: string, normalized: Buffer): Promise<string> {
    const key = avatarKeyFor(userId);
    await this.storage.put(key, normalized, 'image/webp');
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const out = await this.storage.get(key);
      if (!out.Body) return null;
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  /** Best effort: a leftover object is harmless, a failed DB update must not be hidden. */
  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete avatar ${key}: ${(error as Error).message}`);
    }
  }
}
