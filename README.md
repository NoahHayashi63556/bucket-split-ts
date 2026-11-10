# bucket-split-ts

Deterministic hashing that maps a subject string to a stable bucket, with optional weighted buckets.

```js
import { hash32, bucketOf, assign, validateWeights } from 'bucket-split-ts';

// Unweighted split: same subject, same bucket, every time.
bucketOf('user-42', 10); // e.g. 7

// Weighted split: 90% of subjects go to the first variant.
const weights = [9, 1];
assign('user-42', weights); // 0 or 1, stable for this subject

// You can validate weights up front if they come from configuration.
validateWeights(weights); // returns the array unchanged

// The raw hash is exported too, if you want to build your own bucketing.
hash32('user-42'); // unsigned 32-bit integer
```

## Why this exists

A/B assignment needs to survive process restarts, deploys, and horizontally
scaled servers. Anything that depends on `Math.random`, on object identity, or
on the order in which subjects happen to arrive will flip a user between
variants and poison the experiment. This library reduces assignment to a pure
function of the subject string and the bucket configuration, so any server can
recompute the same answer independently.

The trade-off is that the hash is fixed. `assign` projects the hash uniformly
onto `[0, 1)` and walks the cumulative weights, which means changing the weights
reshuffles subjects between buckets. That is the honest behaviour for a
weighted split: the weights describe absolute shares, not a migration from a
previous configuration. If you need to grow a split without reshuffling, use an
unweighted `bucketOf` with a power-of-two bucket count and keep the low bits.

## The edge you will hit

Zero weights are allowed and mean the bucket is unreachable. That is useful for
disabling a variant without renumbering, but it also means `assign` will never
return that index, so downstream code must not assume every index in the weights
array is reachable. An all-zero weights array is rejected, because there would
be nowhere to send anyone.

`hash32` is FNV-1a over the UTF-8 bytes of the input. It is fast and
well-spread for bucketing, but it is not a cryptographic hash and must not be
used for anything security-sensitive.

## API

- `hash32(input: string): number` — unsigned 32-bit FNV-1a hash of the UTF-8 bytes. Throws `TypeError` for non-strings.
- `bucketOf(subject: string, buckets: number): number` — bucket index in `[0, buckets)`. `buckets` must be a positive integer.
- `assign(subject: string, weights: number[]): number` — weighted bucket index. Weights must be finite, non-negative, non-empty, and sum to a positive value.
- `validateWeights(weights: number[]): number[]` — returns the array if valid, otherwise throws.
