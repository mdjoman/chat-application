import { nanoid } from 'nanoid';

export function newId(size = 21): string {
  return nanoid(size);
}

/**
 * Deterministic key for a direct conversation between two users.
 * Sorted ascending so (a,b) and (b,a) produce the same key.
 */
export function directKey(a: number, b: number): string {
  const [min, max] = a < b ? [a, b] : [b, a];
  return `${min}:${max}`;
}
