/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем. */
export function toKop(rub: number): number {
  // Поправка только на погрешность IEEE-754 (например, 1.15 * 100 = 114.99999999999999).
  return Math.floor(rub * 100 + 1e-8);
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
