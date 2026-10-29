import type { RequestHandler } from "express";

// One process/one receiving ledger today. Bound memory as well as request rate;
// a full table refuses new buckets until expiry instead of evicting live limits.
export function requestLimit(options: {
  limit: number;
  windowMs: number;
  key: (req: Parameters<RequestHandler>[0]) => string;
  maxKeys?: number;
  now?: () => number;
}): RequestHandler {
  const buckets = new Map<string, { reset: number; count: number }>();
  const now = options.now ?? Date.now;
  return (req, res, next) => {
    const time = now();
    for (const [key, value] of buckets)
      if (value.reset <= time) buckets.delete(key);
    const key = options.key(req);
    let bucket = buckets.get(key);
    if (!bucket && buckets.size < (options.maxKeys ?? 5000)) {
      bucket = { reset: time + options.windowMs, count: 0 };
      buckets.set(key, bucket);
    }
    if (!bucket || ++bucket.count > options.limit) {
      res
        .set(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil(
                ((bucket?.reset ?? time + options.windowMs) - time) / 1000,
              ),
            ),
          ),
        )
        .status(429)
        .json({ error: "Too many requests. Please wait before trying again." });
      return;
    }
    next();
  };
}
