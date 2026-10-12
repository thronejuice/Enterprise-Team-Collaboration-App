import { Injectable, Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { StorageService } from '../recordings/storage.service';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE = 256;
/** Decoded size cap: a small compressed file can still expand to hundreds of megabytes of pixels. */
export const MAX_INPUT_PIXELS = 4096 * 4096;
/** Images decoded at the same time. Decoding is CPU and memory heavy and must not starve meetings. */
export const MAX_CONCURRENT_DECODES = 2;

/** Runs at most `limit` tasks at once; the rest wait their turn. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      // The slot is handed over by release(), so `active` stays at the limit and nobody can jump the queue.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/** Detects the real format from magic bytes; the file name and Content-Type are never trusted. */
export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

/**
 * Width and height from the file header, without decoding any pixels. Returns null for anything that is not a
 * well-formed JPEG, PNG or WebP header. Used to refuse huge images before they are allocated.
 */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  switch (sniffImageType(buf)) {
    case 'png':
      return buf.length >= 24 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null;
    case 'jpeg': {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) return null;
        const marker = buf[offset + 1];
        if (marker === 0xff) { offset++; continue; } // fill byte
        // Start-of-frame markers carry the size; C4, C8 and CC are not frames.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        offset += 2 + buf.readUInt16BE(offset + 2);
      }
      return null;
    }
    case 'webp': {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L' && buf.length >= 25) {
        return { width: 1 + (((buf[22] & 0x3f) << 8) | buf[21]), height: 1 + (((buf[24] & 0x0f) << 10) | (buf[23] << 2) | ((buf[22] & 0xc0) >> 6)) };
      }
      if (chunk === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      return null;
    }
    default:
      return null;
  }
}

/** Avatars live under avatars/<userId>/ in the recordings bucket; objects are only ever written by the API. */
export const avatarKeyFor = (userId: string) => `avatars/${userId}/${randomBytes(12).toString('hex')}.webp`;

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  private readonly decodes = new Semaphore(MAX_CONCURRENT_DECODES);

  constructor(private readonly storage: StorageService) {}

  /**
   * Crops to a square, scales to 256×256, re-encodes as WebP. The picture is redrawn from decoded pixels, so no
   * EXIF/GPS/XMP survives (only the standard colour profile the encoder adds). EXIF orientation is applied while decoding.
   */
  async normalize(input: Buffer): Promise<Buffer> {
    if (!sniffImageType(input)) {
      throw new UnsupportedMediaTypeException('Avatar must be a JPG, PNG or WebP image.');
    }
    const size = imageDimensions(input);
    if (!size || size.width < 1 || size.height < 1 || size.width * size.height > MAX_INPUT_PIXELS) {
      throw new UnsupportedMediaTypeException('Avatar could not be read as an image.');
    }
    try {
      return await this.decodes.run(async () => {
        const image = await loadImage(input);
        const side = Math.min(image.width, image.height);
        const canvas = createCanvas(AVATAR_SIZE, AVATAR_SIZE);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        return canvas.encode('webp', 90);
      });
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
