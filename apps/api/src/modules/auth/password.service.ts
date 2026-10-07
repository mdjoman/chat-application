import argon2 from 'argon2';
import { env } from '../../config/env.js';

const options: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: env.ARGON2_MEMORY_COST,
  timeCost: env.ARGON2_TIME_COST,
  parallelism: env.ARGON2_PARALLELISM,
};

export class PasswordService {
  static async hash(plain: string): Promise<string> {
    return argon2.hash(plain, options);
  }

  static async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
