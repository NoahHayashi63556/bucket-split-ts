// Public surface of bucket-split-ts.
//
// Everything a caller needs is re-exported here so that consumers never have to
// reach into internal module paths. Keeping the barrel small also makes the
// stable contract obvious: if it is not in this file, it is not API.

export { hash32, bucketOf, assign, validateWeights } from './core.js';
