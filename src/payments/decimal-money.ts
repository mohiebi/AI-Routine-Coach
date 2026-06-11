import { Prisma } from '@prisma/client';

export function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function tokenAmount(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatUsd(value: Prisma.Decimal.Value) {
  return `$${money(value).toFixed(2)}`;
}

export function formatToken(value: Prisma.Decimal.Value) {
  return tokenAmount(value).toFixed(3);
}

export function rawTokenToDecimal(raw: string, decimals: number) {
  const base = new Prisma.Decimal(10).pow(decimals);
  return new Prisma.Decimal(raw).div(base);
}
