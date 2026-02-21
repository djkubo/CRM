export const DEFAULT_MXN_TO_USD_RATE = 0.05;

export function normalizeCurrency(currency: string | null | undefined): string {
  const code = typeof currency === "string" ? currency.trim().toLowerCase() : "";
  return code || "usd";
}

export function toUsdEquivalentFromCents(
  amountCents: number,
  currency: string | null | undefined,
  mxnToUsdRate: number = DEFAULT_MXN_TO_USD_RATE
): number {
  const curr = normalizeCurrency(currency);
  const amountMajor = (Number(amountCents) || 0) / 100;

  if (curr === "mxn") {
    return amountMajor * mxnToUsdRate;
  }

  return amountMajor;
}

export function toUsdEquivalentFromMajor(
  amountMajor: number,
  currency: string | null | undefined,
  mxnToUsdRate: number = DEFAULT_MXN_TO_USD_RATE
): number {
  const curr = normalizeCurrency(currency);
  const value = Number(amountMajor) || 0;

  if (curr === "mxn") {
    return value * mxnToUsdRate;
  }

  return value;
}

export function formatUsd(
  amount: number,
  locale: string = "en-US",
  maximumFractionDigits: number = 2
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(Number.isFinite(amount) ? amount : 0);
}
