import argon2 from "argon2";
import { z } from "zod";
import { SecurityError } from "./store";
export const passwordSchema = z.string().min(15).max(128);
let inflight = 0;
async function bounded<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= 4)
    throw new SecurityError(429, "Too many attempts. Try again later.");
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
  }
}
export const hashPassword = (password: string) =>
  bounded(() =>
    argon2.hash(passwordSchema.parse(password), {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
  );
export const verifyPassword = (hash: string, password: string) =>
  bounded(() => argon2.verify(hash, password));
