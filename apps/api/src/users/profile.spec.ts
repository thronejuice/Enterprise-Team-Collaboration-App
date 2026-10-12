import { accountStatus, csvCell, csvLine, effectiveAtFor, generateTemporaryPassword, normalizeEmployeeId, normalizePhone } from './profile';
import { anonymizedProfile } from './suspension.service';
import { sniffImageType } from './avatar.service';
import { deviceLabel } from '../auth/session.service';

describe('effective date (Asia/Bangkok, 23:59 of the chosen day)', () => {
  it('"now" is the current instant', () => {
    const now = new Date('2026-10-12T03:00:00Z');
    expect(effectiveAtFor('now', now)).toBe(now);
  });

  it('a day means 23:59 in Bangkok, even when that is still the previous day in UTC', () => {
    const now = new Date('2026-10-12T03:00:00Z');
    // 2026-10-31 23:59 +07:00 is 2026-10-31 16:59 UTC
    expect(effectiveAtFor('2026-10-31', now).toISOString()).toBe('2026-10-31T16:59:00.000Z');
  });

  it('today in Bangkok is allowed, yesterday is not (checked against Bangkok date, not UTC)', () => {
    // 2026-10-12 20:00 UTC is already 2026-10-13 03:00 in Bangkok
    const lateUtc = new Date('2026-10-12T20:00:00Z');
    expect(() => effectiveAtFor('2026-10-13', lateUtc)).not.toThrow();
    expect(() => effectiveAtFor('2026-10-12', lateUtc)).toThrow('cannot be in the past');
  });

  it('rejects malformed and impossible dates', () => {
    const now = new Date('2026-10-12T03:00:00Z');
    expect(() => effectiveAtFor('2026-02-30', now)).toThrow('not a valid date');
    expect(() => effectiveAtFor('12/10/2026', now)).toThrow('YYYY-MM-DD');
  });
});

describe('CSV output', () => {
  it('prefixes formula-looking cells with an apostrophe', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`'+1`);
    expect(csvCell('-5')).toBe(`'-5`);
    expect(csvCell('@sum')).toBe(`'@sum`);
    expect(csvCell('\tcmd')).toBe(`'\tcmd`);
  });

  it('quotes commas, quotes and newlines; keeps Thai text as-is', () => {
    expect(csvLine(['a,b', 'say "hi"', 'สมชาย', null])).toBe('"a,b","say ""hi""",สมชาย,');
  });
});

describe('temporary passwords', () => {
  it('are 14 characters without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(14);
      expect(pw).toMatch(/^[A-Za-z2-9]+$/);
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('field rules', () => {
  it('employee IDs are upper-cased and limited to A-Z 0-9 - _', () => {
    expect(normalizeEmployeeId(' emp-0042_a ')).toBe('EMP-0042_A');
    expect(() => normalizeEmployeeId('bad id')).toThrow();
    expect(() => normalizeEmployeeId('x'.repeat(33))).toThrow();
  });

  it('phone allows digits, +, spaces and dashes only', () => {
    expect(normalizePhone('+66 81-234 5678')).toBe('+66 81-234 5678');
    expect(normalizePhone('   ')).toBeNull();
    expect(() => normalizePhone('081(234)')).toThrow();
  });
});

describe('account status', () => {
  it('derives Active / Leaving / Suspended / Anonymized', () => {
    expect(accountStatus({ isActive: true, anonymizedAt: null }, false)).toBe('ACTIVE');
    expect(accountStatus({ isActive: true, anonymizedAt: null }, true)).toBe('LEAVING');
    expect(accountStatus({ isActive: false, anonymizedAt: null }, false)).toBe('SUSPENDED');
    expect(accountStatus({ isActive: false, anonymizedAt: new Date() }, false)).toBe('ANONYMIZED');
  });
});

describe('anonymize', () => {
  it('clears every personal field and uses the Former user label', () => {
    const userId = '1a2b3c4d-0000-4000-8000-000000000000';
    expect(anonymizedProfile(userId)).toEqual({
      email: `anonymized-${userId}@anonymized.invalid`,
      displayName: 'Former user #1A2B',
      firstName: null,
      lastName: null,
      phone: null,
      employeeId: null,
      jobTitle: null,
      departmentId: null,
      avatarKey: null,
      avatarUpdatedAt: null,
    });
  });
});

describe('avatar input', () => {
  it('detects formats from magic bytes, not from the claimed type', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    expect(sniffImageType(webp)).toBe('webp');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe('session device label', () => {
  it('parses the browser and OS, with a fallback for legacy sessions', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(deviceLabel(undefined)).toBe('Unknown device');
  });
});
