import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AvatarService, imageDimensions, MAX_INPUT_PIXELS, Semaphore, sniffImageType } from './avatar.service';

describe('Semaphore', () => {
  it('never runs more than the limit at once and runs every task', async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    };
    await Promise.all(Array.from({ length: 12 }, () => sem.run(task)));
    expect(peak).toBe(2);
    expect(running).toBe(0);
  });

  it('keeps going after a task throws', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });
});

/** Left half red, right half blue. */
async function halves(width: number, height: number, format: 'jpeg' | 'png' | 'webp'): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(width / 2, 0, width / 2, height);
  return format === 'png' ? canvas.encode('png') : canvas.encode(format, 95);
}

/** Inserts an EXIF APP1 segment (little-endian TIFF with an Orientation tag and some GPS-looking text) after the JPEG SOI. */
function withExif(jpeg: Buffer, orientation: number, secret = 'GPSLatitude=13.7563N secret-camera-owner'): Buffer {
  const text = Buffer.from(secret + '\0', 'ascii');
  const ifd = Buffer.alloc(2 + 12 + 4);
  ifd.writeUInt16LE(1, 0); // one entry
  ifd.writeUInt16LE(0x0112, 2); // Orientation
  ifd.writeUInt16LE(3, 4); // SHORT
  ifd.writeUInt32LE(1, 6);
  ifd.writeUInt16LE(orientation, 10);
  const tiff = Buffer.concat([Buffer.from('II', 'ascii'), Buffer.from([0x2a, 0, 8, 0, 0, 0]), ifd, text]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, body, jpeg.subarray(2)]);
}

/** Top-level chunk names of a WebP (RIFF) file. */
function webpChunks(buf: Buffer): string[] {
  const names: string[] = [];
  for (let offset = 12; offset + 8 <= buf.length; ) {
    names.push(buf.subarray(offset, offset + 4).toString('ascii'));
    offset += 8 + buf.readUInt32LE(offset + 4) + (buf.readUInt32LE(offset + 4) % 2);
  }
  return names;
}

async function pixel(webp: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const image = await loadImage(webp);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60;
const isBlue = ([r, g, b]: number[]) => b > 200 && r < 60 && g < 60;

describe('avatar normalisation', () => {
  const service = new AvatarService({} as never);

  it.each(['jpeg', 'png', 'webp'] as const)('turns a %s into a 256x256 WebP', async (format) => {
    const out = await service.normalize(await halves(600, 400, format));
    expect(sniffImageType(out)).toBe('webp');
    expect(imageDimensions(out)).toEqual({ width: 256, height: 256 });
  });

  it('crops the centre square (cover), not the left edge or a squashed image', async () => {
    const out = await service.normalize(await halves(600, 300, 'png')); // centre 300x300 keeps both colours half and half
    expect(isRed(await pixel(out, 8, 128))).toBe(true);
    expect(isBlue(await pixel(out, 247, 128))).toBe(true);
  });

  it('applies the EXIF orientation while decoding (orientation 6 = rotate 90° clockwise)', async () => {
    const out = await service.normalize(withExif(await halves(200, 100, 'jpeg'), 6));
    // The red left half becomes the top half after the rotation.
    expect(isRed(await pixel(out, 128, 8))).toBe(true);
    expect(isBlue(await pixel(out, 128, 247))).toBe(true);
  });

  it('leaves no EXIF, XMP or GPS text in the output', async () => {
    const out = await service.normalize(withExif(await halves(200, 100, 'jpeg'), 1));
    const chunks = webpChunks(out);
    expect(chunks.filter((c) => c === 'EXIF' || c === 'XMP ')).toEqual([]);
    expect(chunks.every((c) => ['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP'].includes(c))).toBe(true);
    expect(out.toString('latin1')).not.toMatch(/GPSLatitude|secret-camera-owner|Exif/);
  });

  it('keeps transparency', async () => {
    const canvas = createCanvas(64, 64);
    canvas.getContext('2d').fillStyle = 'rgba(255,0,0,0.3)';
    canvas.getContext('2d').fillRect(0, 0, 64, 64);
    const out = await service.normalize(await canvas.encode('png'));
    const image = await loadImage(out);
    const c2 = createCanvas(256, 256);
    c2.getContext('2d').drawImage(image, 0, 0);
    expect(c2.getContext('2d').getImageData(128, 128, 1, 1).data[3]).toBeLessThan(255);
  });

  it('rejects files that are not JPG, PNG or WebP, whatever they claim to be', async () => {
    for (const bad of [Buffer.from('GIF89a......'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('MZ\x90\0exe')]) {
      await expect(service.normalize(bad)).rejects.toThrow('JPG, PNG or WebP');
    }
  });

  it('rejects a truncated or corrupt image', async () => {
    const png = await halves(100, 100, 'png');
    await expect(service.normalize(png.subarray(0, 40))).rejects.toThrow('could not be read');
    await expect(service.normalize(Buffer.concat([png.subarray(0, 33), Buffer.alloc(40, 7)]))).rejects.toThrow('could not be read');
  });

  it('rejects an image over the pixel cap (small file, huge canvas) and accepts one just under it', async () => {
    const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 8;
    const bomb = await halves(side, side, 'png');
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(service.normalize(bomb)).rejects.toThrow('could not be read');

    const ok = await halves(1024, 1024, 'png');
    expect(imageDimensions(await service.normalize(ok))).toEqual({ width: 256, height: 256 });
  });

  it('rejects a header that claims a huge size before decoding it', async () => {
    // 33-byte PNG prefix claiming 60000x60000: decoding it would allocate ~14 GB.
    const png = (await halves(10, 10, 'png')).subarray(0, 33);
    png.writeUInt32BE(60000, 16);
    png.writeUInt32BE(60000, 20);
    expect(imageDimensions(png)).toEqual({ width: 60000, height: 60000 });
    await expect(service.normalize(png)).rejects.toThrow('could not be read');
  });
});

describe('imageDimensions reads the header of each format', () => {
  it('PNG, JPEG (also after an EXIF segment) and lossy WebP', async () => {
    expect(imageDimensions(await halves(123, 45, 'png'))).toEqual({ width: 123, height: 45 });
    expect(imageDimensions(await halves(123, 45, 'jpeg'))).toEqual({ width: 123, height: 45 });
    expect(imageDimensions(withExif(await halves(123, 45, 'jpeg'), 1))).toEqual({ width: 123, height: 45 });
    expect(imageDimensions(await halves(123, 45, 'webp'))).toEqual({ width: 123, height: 45 });
  });

  it('lossless (VP8L) and extended (VP8X) WebP headers', () => {
    const riff = (chunk: string, body: Buffer) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP' + chunk), Buffer.alloc(4), body]);
    // VP8L: signature 0x2f, then 14 bits of (width-1) and 14 bits of (height-1)
    const w = 300 - 1, h = 200 - 1;
    const bits = Buffer.from([0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]);
    expect(imageDimensions(riff('VP8L', bits))).toEqual({ width: 300, height: 200 });
    // VP8X: 4 flag bytes, then 24-bit (width-1), 24-bit (height-1)
    const x = Buffer.alloc(10);
    x.writeUIntLE(640 - 1, 4, 3);
    x.writeUIntLE(480 - 1, 7, 3);
    expect(imageDimensions(riff('VP8X', x))).toEqual({ width: 640, height: 480 });
  });

  it('returns null for malformed or foreign data', () => {
    expect(imageDimensions(Buffer.from('hello'))).toBeNull();
    expect(imageDimensions(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(imageDimensions(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPJUNK'), Buffer.alloc(30)]))).toBeNull();
  });
});
