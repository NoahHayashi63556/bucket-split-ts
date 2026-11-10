import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hash32, bucketOf, assign, validateWeights } from '../src/index.js';

test('hash32 is deterministic for the same input', () => {
  assert.equal(hash32('alice'), hash32('alice'));
  assert.equal(hash32(''), hash32(''));
});

test('hash32 returns an unsigned 32-bit integer', () => {
  for (const subject of ['', 'a', 'alice', 'bob', 'x'.repeat(1000)]) {
    const h = hash32(subject);
    assert.ok(Number.isInteger(h), `hash of ${JSON.stringify(subject)} is an integer`);
    assert.ok(h >= 0 && h < 2 ** 32, `hash of ${JSON.stringify(subject)} is in range`);
  }
});

test('hash32 distinguishes inputs that differ only in case or whitespace', () => {
  assert.notEqual(hash32('alice'), hash32('Alice'));
  assert.notEqual(hash32('alice'), hash32('alice '));
});

test('hash32 handles non-ASCII via UTF-8 bytes', () => {
  // These two strings have the same UTF-16 length but different UTF-8 bytes,
  // so a byte-wise hash must separate them.
  assert.notEqual(hash32('\u00e9'), hash32('e'));
  assert.equal(hash32('\u00e9'), hash32('\u00e9'));
});

test('hash32 rejects non-string input', () => {
  assert.throws(() => hash32(42), TypeError);
  assert.throws(() => hash32(null), TypeError);
});

test('bucketOf stays within range for many subjects', () => {
  const buckets = 7;
  for (let i = 0; i < 500; i++) {
    const b = bucketOf(`subject-${i}`, buckets);
    assert.ok(Number.isInteger(b), 'bucket is an integer');
    assert.ok(b >= 0 && b < buckets, `bucket ${b} is within [0, ${buckets})`);
  }
});

test('bucketOf is stable across repeated calls', () => {
  assert.equal(bucketOf('alice', 10), bucketOf('alice', 10));
});

test('bucketOf with a single bucket always returns zero', () => {
  assert.equal(bucketOf('alice', 1), 0);
  assert.equal(bucketOf('', 1), 0);
});

test('bucketOf rejects invalid bucket counts', () => {
  assert.throws(() => bucketOf('alice', 0), RangeError);
  assert.throws(() => bucketOf('alice', -3), RangeError);
  assert.throws(() => bucketOf('alice', 2.5), RangeError);
  assert.throws(() => bucketOf(1, 4), TypeError);
});

test('validateWeights accepts a plain positive array', () => {
  const weights = [1, 1, 2];
  assert.equal(validateWeights(weights), weights);
});

test('validateWeights allows zero weights but rejects all-zero', () => {
  assert.deepEqual(validateWeights([0, 1, 0]), [0, 1, 0]);
  assert.throws(() => validateWeights([0, 0]), RangeError);
});

test('validateWeights rejects malformed input', () => {
  assert.throws(() => validateWeights([]), TypeError);
  assert.throws(() => validateWeights('nope'), TypeError);
  assert.throws(() => validateWeights([1, -1]), RangeError);
  assert.throws(() => validateWeights([1, NaN]), RangeError);
  assert.throws(() => validateWeights([1, Infinity]), RangeError);
});

test('assign is deterministic for the same subject and weights', () => {
  const weights = [1, 1, 1];
  assert.equal(assign('alice', weights), assign('alice', weights));
});

test('assign returns an index into the weights array', () => {
  const weights = [1, 2, 3, 4];
  for (let i = 0; i < 300; i++) {
    const idx = assign(`subject-${i}`, weights);
    assert.ok(Number.isInteger(idx), 'index is an integer');
    assert.ok(idx >= 0 && idx < weights.length, `index ${idx} is in range`);
  }
});

test('assign never selects a zero-weight bucket', () => {
  const weights = [0, 1, 0, 1];
  for (let i = 0; i < 300; i++) {
    const idx = assign(`subject-${i}`, weights);
    assert.ok(idx === 1 || idx === 3, `subject-${i} landed in enabled bucket ${idx}`);
  }
});

test('assign with a single weight always returns zero', () => {
  assert.equal(assign('alice', [5]), 0);
  assert.equal(assign('', [0.001]), 0);
});

test('assign rejects malformed weights', () => {
  assert.throws(() => assign('alice', []), TypeError);
  assert.throws(() => assign('alice', [1, -1]), RangeError);
  assert.throws(() => assign(7, [1]), TypeError);
});

test('assign spreads a large sample across all positive buckets', () => {
  const weights = [1, 1, 1, 1];
  const counts = new Array(weights.length).fill(0);
  const n = 4000;
  for (let i = 0; i < n; i++) {
    counts[assign(`user-${i}`, weights)]++;
  }
  for (const c of counts) {
    // With 4000 samples and four equal buckets, an empty bucket would signal a
    // badly broken hash. We only assert non-emptiness, not an exact ratio, so
    // the test stays deterministic and does not encode a specific hash output.
    assert.ok(c > 0, 'every equal bucket received at least one subject');
  }
});

test('assign respects rough weight proportions', () => {
  const weights = [3, 1];
  const counts = [0, 0];
  const n = 8000;
  for (let i = 0; i < n; i++) {
    counts[assign(`user-${i}`, weights)]++;
  }
  // The heavy bucket should clearly dominate; we use a loose bound so the test
  // does not depend on the exact hash distribution.
  assert.ok(counts[0] > counts[1], 'heavier bucket received more subjects');
  assert.ok(counts[0] > n * 0.5, 'heavier bucket received the majority');
});
