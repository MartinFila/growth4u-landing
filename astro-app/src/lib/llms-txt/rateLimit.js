export function createRateLimiter({ windowMs = 60_000, max = 12 } = {}) {
  const buckets = new Map();

  return function rateLimiter(request, response, next) {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      response.set("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: `Too many generation requests. Try again in ${retryAfterSeconds} seconds.`
      });
      return;
    }

    next();
  };
}

export function createConcurrencyLimiter({ maxConcurrent = 2 } = {}) {
  let active = 0;
  const queue = [];

  return async function runLimited(task) {
    if (active >= maxConcurrent) {
      await new Promise((resolve) => queue.push(resolve));
    }

    active += 1;

    try {
      return await task();
    } finally {
      active -= 1;
      const next = queue.shift();
      if (next) {
        next();
      }
    }
  };
}
