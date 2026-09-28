export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** 8 → «8 €», 6.4 → «6,40 €». */
export function formatPrice(value: number): string {
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
