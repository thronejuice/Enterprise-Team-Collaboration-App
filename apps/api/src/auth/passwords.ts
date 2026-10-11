import * as argon2 from 'argon2';

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

/** Used to keep login timing similar for unknown emails. */
let dummyHash: Promise<string> | undefined;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  return dummyHash.then((h) => verifyPassword(h, password)).then(() => false);
}
