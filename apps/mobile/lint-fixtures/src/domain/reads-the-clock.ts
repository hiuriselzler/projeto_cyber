// expect: no-restricted-properties [fence:domain-purity]
export const now = () => Date.now();
export const random = () => Math.random();
export const tick = () => performance.now();
