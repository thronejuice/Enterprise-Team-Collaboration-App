import sharp from 'sharp';
import { AvatarService, MAX_INPUT_PIXELS, Semaphore } from './avatar.service';

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

describe('avatar decoding limits', () => {
  const service = new AvatarService({} as never);

  it('accepts a normal image and returns a 256x256 WebP without metadata', async () => {
    const src = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();
    const out = await service.normalize(src);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height, !!meta.exif]).toEqual(['webp', 256, 256, false]);
  });

  it('rejects an image whose decoded size is over the pixel cap (small file, huge canvas)', async () => {
    const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 8;
    const bomb = await sharp({ create: { width: side, height: side, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(service.normalize(bomb)).rejects.toThrow('could not be read');
  });
});
