// Bucket Split: deterministic hashing for stable A/B assignment.
//
// The design goal is that the same subject string always lands in the same
// bucket for a given number of buckets, on every process and every machine,
// without any shared state. That rules out Math.random and rules out any
// hashing that depends on object identity or insertion order.

/**
 * FNV-1a 32-bit hash over the UTF-8 bytes of `input`.
 *
 * Why FNV-1a instead of a cryptographic hash? We only need a uniform,
 * deterministic spread, not collision resistance. FNV-1a is a handful of
 * integer ops, has no dependencies, and its 32-bit output is plenty for
 * bucketing a few thousand variants. We hash the UTF-8 encoding rather than
 * the UTF-16 code units so that the same logical string produces the same
 * bucket regardless of how the host language stores it.
 *
 * @param {string} input
 * @returns {number} unsigned 32-bit integer in [0, 2^32)
 */
export function hash32(input) {
  if (typeof input !== 'string') {
    throw new TypeError('hash32 expects a string');
  }

  // TextEncoder is part of the standard library in Node and in browsers.
  const bytes = new TextEncoder().encode(input);

  // FNV offset basis and prime for 32-bit FNV-1a.
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    // Multiply by 16777619 using Math.imul so the result stays a 32-bit
    // integer instead of drifting into float territory.
    h = Math.imul(h, 0x01000193);
  }

  // Math.imul returns a signed 32-bit value; >>> 0 reinterprets it as unsigned.
  return h >>> 0;
}

/**
 * Map a subject to a bucket index in [0, buckets).
 *
 * The modulo is applied to the unsigned hash, so the result is never negative.
 *
 * @param {string} subject
 * @param {number} buckets positive integer count of buckets
 * @returns {number} integer bucket index
 */
export function bucketOf(subject, buckets) {
  if (typeof subject !== 'string') {
    throw new TypeError('bucketOf expects a string subject');
  }
  if (!Number.isInteger(buckets) || buckets <= 0) {
    throw new RangeError('bucketOf expects a positive integer bucket count');
  }
  return hash32(subject) % buckets;
}

/**
 * Validate a weights array.
 *
 * Weights describe the relative size of each bucket. They must be a non-empty
 * array of finite, non-negative numbers with a positive total. A zero weight is
 * allowed and means the bucket is unreachable; that is a deliberate choice so
 * callers can disable a variant without renumbering.
 *
 * @param {number[]} weights
 * @returns {number[]} the same weights, for chaining
 */
export function validateWeights(weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new TypeError('weights must be a non-empty array');
  }

  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      throw new RangeError(`weight at index ${i} must be a finite non-negative number`);
    }
    total += w;
  }

  if (total <= 0) {
    throw new RangeError('weights must sum to a positive value');
  }

  return weights;
}

/**
 * Assign a subject to a weighted bucket.
 *
 * The subject is hashed once and the resulting 32-bit value is projected into
 * [0, 1). We then walk the weights accumulating a running share until the
 * projected value falls below the running total. This is the standard
 * cumulative-distribution trick and it keeps assignment stable as long as the
 * weights themselves do not change.
 *
 * Trade-off: changing the weights reshuffles subjects between buckets, because
 * the projection is absolute rather than relative to the previous weights.
 * That is the honest behaviour for a weighted split; callers who need
 * reshuffle-free resizing should use an unweighted split with a power-of-two
 * bucket count and drop the high bits.
 *
 * @param {string} subject
 * @param {number[]} weights relative bucket sizes
 * @returns {number} index into `weights`
 */
export function assign(subject, weights) {
  if (typeof subject !== 'string') {
    throw new TypeError('assign expects a string subject');
  }
  validateWeights(weights);

  const total = weights.reduce((acc, w) => acc + w, 0);

  // Divide by 2^32 rather than 2^32 - 1 so the maximum hash maps strictly
  // below 1.0 and the final bucket is reachable by the `<` comparison.
  const point = hash32(subject) / 4294967296;

  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i] / total;
    if (point < running) {
      return i;
    }
  }

  // Floating-point accumulation can leave `running` a hair below 1.0 after the
  // final bucket. Falling through here is that case; the last bucket is the
  // correct owner. Zero-weight buckets at the tail are still skipped because
  // `point < running` would not have advanced past them.
  return weights.length - 1;
}
