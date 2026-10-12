import { deviceKey, isDesktop } from './session.service';

const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

describe('one computer at a time (phones and tablets are exempt)', () => {
  it('computers are limited, phones and tablets are not', () => {
    expect(isDesktop(WIN_CHROME)).toBe(true);
    expect(isDesktop(MAC)).toBe(true);
    expect(isDesktop(IPHONE)).toBe(false);
    expect(isDesktop(IPAD)).toBe(false);
    expect(isDesktop(ANDROID)).toBe(false);
  });

  it('a missing User-Agent counts as a computer (the stricter choice)', () => {
    expect(isDesktop(undefined)).toBe(true);
  });

  it('two browsers on the same machine (same IP and OS) are one computer', () => {
    expect(deviceKey('10.0.0.5', WIN_CHROME)).toBe(deviceKey('10.0.0.5', WIN_EDGE));
  });

  it('a different IP or a different operating system is another computer', () => {
    expect(deviceKey('10.0.0.5', WIN_CHROME)).not.toBe(deviceKey('10.0.0.6', WIN_CHROME));
    expect(deviceKey('10.0.0.5', WIN_CHROME)).not.toBe(deviceKey('10.0.0.5', MAC));
  });
});
