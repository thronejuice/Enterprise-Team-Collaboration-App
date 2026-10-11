import { randomInt } from 'node:crypto';

export const ROOM_CODE_PATTERN = /^[0-9]{4}$/;
export const MAX_ROOM_CODE_ATTEMPTS = 20;

/** A cryptographically random code in 0000–9999, kept as a string to preserve leading zeroes. */
export function generateRoomCode(random: (max: number) => number = (max) => randomInt(0, max)): string {
  return random(10000).toString().padStart(4, '0');
}

export function isValidRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

/**
 * Tries to persist a new code, retrying on uniqueness collisions a bounded number of times.
 * `insert` must throw an error for which `isCollision` returns true when the code is taken.
 */
export async function createWithUniqueCode<T>(
  insert: (code: string) => Promise<T>,
  isCollision: (error: unknown) => boolean,
  generate: () => string = generateRoomCode,
  maxAttempts = MAX_ROOM_CODE_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await insert(generate());
    } catch (error) {
      if (!isCollision(error)) throw error;
    }
  }
  throw new RoomCodeExhaustedError(maxAttempts);
}

export class RoomCodeExhaustedError extends Error {
  constructor(attempts: number) {
    super(`Could not allocate a unique room code after ${attempts} attempts`);
  }
}
