'use client';

/** All money is stored as an integer number of fils (1 JOD = 1000 fils). Never use Float for money. */
export function filsToDinar(fils: number): string {
  return (fils / 1000).toFixed(2);
}

export function dinarInputToFils(value: string): number {
  const dinars = Number(value);
  if (!Number.isFinite(dinars)) return 0;
  return Math.round(dinars * 1000);
}
