/**
 * Cubo de fichas por cliente, en memoria. Protege el asistente desde la web: para la API todas las
 * preguntas llegan desde el servidor de la web, así que sin este límite un solo usuario podría
 * agotar el cupo de todos.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
    private readonly maxClients = 10_000,
  ) {}

  /** Segundos que hay que esperar; 0 si la petición se acepta. */
  acquire(client: string): number {
    const now = this.now();
    const rate = this.perMinute / 60_000;
    const bucket = this.buckets.get(client) ?? { tokens: this.perMinute, updated: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + (now - bucket.updated) * rate);
    bucket.updated = now;

    this.buckets.delete(client);
    this.buckets.set(client, bucket);
    if (this.buckets.size > this.maxClients) {
      // El Map conserva el orden de inserción: el primero es el cliente inactivo hace más tiempo.
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) {
        this.buckets.delete(oldest);
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - bucket.tokens) / rate / 1000);
  }
}

/** IP del visitante según el proxy de delante, que debe fijar `X-Real-IP`. */
export function clientAddress(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "desconocido"
  );
}
