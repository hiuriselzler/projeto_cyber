// expect: no-restricted-globals [fence:network]
export const load = () => fetch('https://example.com');
