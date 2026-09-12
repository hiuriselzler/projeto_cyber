// expect: no-restricted-properties [fence:network]
export const load = () => globalThis.fetch('https://example.com');
