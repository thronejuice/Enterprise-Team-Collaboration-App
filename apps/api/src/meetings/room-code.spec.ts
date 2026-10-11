import { createWithUniqueCode, generateRoomCode, isValidRoomCode, RoomCodeExhaustedError } from './room-code';

describe('generateRoomCode', () => {
  it('preserves leading zeroes', () => {
    expect(generateRoomCode(() => 0)).toBe('0000');
    expect(generateRoomCode(() => 7)).toBe('0007');
    expect(generateRoomCode(() => 42)).toBe('0042');
    expect(generateRoomCode(() => 9999)).toBe('9999');
  });

  it('always produces exactly four digits with the real CSPRNG', () => {
    for (let i = 0; i < 2000; i++) expect(generateRoomCode()).toMatch(/^[0-9]{4}$/);
  });
});

describe('isValidRoomCode', () => {
  it.each(['0000', '0420', '9999'])('accepts %s', (code) => expect(isValidRoomCode(code)).toBe(true));
  it.each(['', '123', '12345', 'abcd', '12a4', ' 1234', 1234, null])('rejects %p', (code) =>
    expect(isValidRoomCode(code)).toBe(false),
  );
});

describe('createWithUniqueCode', () => {
  const collision = new Error('collision');
  const isCollision = (e: unknown) => e === collision;

  it('retries on collision with a new code', async () => {
    const taken = new Set(['1111', '2222']);
    const codes = ['1111', '2222', '3333'];
    const result = await createWithUniqueCode(
      async (code) => {
        if (taken.has(code)) throw collision;
        return code;
      },
      isCollision,
      () => codes.shift()!,
    );
    expect(result).toBe('3333');
  });

  it('gives up after a bounded number of attempts', async () => {
    let calls = 0;
    await expect(
      createWithUniqueCode(
        async () => {
          calls++;
          throw collision;
        },
        isCollision,
        () => '0000',
        5,
      ),
    ).rejects.toBeInstanceOf(RoomCodeExhaustedError);
    expect(calls).toBe(5);
  });

  it('does not swallow unrelated errors', async () => {
    const boom = new Error('db down');
    await expect(createWithUniqueCode(async () => { throw boom; }, isCollision)).rejects.toBe(boom);
  });
});
