import { assertApiBaseUrlAllowed, InsecureApiBaseUrlError } from '../api-client';

describe('the API base URL guard (04 §5)', () => {
  it.each(['https://api.cyberathlete.app', 'https://api.cyberathlete.app/', ' https://API.example '])(
    'a release build accepts https: %p',
    (url) => {
      expect(() => assertApiBaseUrlAllowed(url, 'release')).not.toThrow();
    },
  );

  it('strips the trailing slash from an accepted URL', () => {
    expect(assertApiBaseUrlAllowed('https://api.cyberathlete.app/', 'release')).toBe(
      'https://api.cyberathlete.app',
    );
  });

  it.each(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://api.cyberathlete.app'])(
    'a release build refuses http, even to this machine: %p',
    (url) => {
      expect(() => assertApiBaseUrlAllowed(url, 'release')).toThrow(InsecureApiBaseUrlError);
    },
  );

  it.each(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://LOCALHOST:8000/'])(
    'a debug build accepts http to this machine: %p',
    (url) => {
      expect(() => assertApiBaseUrlAllowed(url, 'debug')).not.toThrow();
    },
  );

  it.each([
    'http://192.168.0.10:8000',
    'http://10.0.2.2:8000',
    'http://api.cyberathlete.app',
    'http://localhost.evil.example:8000',
    'http://evil.example@localhost:8000',
  ])('a debug build refuses http anywhere else: %p', (url) => {
    expect(() => assertApiBaseUrlAllowed(url, 'debug')).toThrow(InsecureApiBaseUrlError);
  });

  it.each(['', 'localhost:8000', 'ftp://localhost', 'ws://localhost:8000'])(
    'refuses anything that is not an http or https URL: %p',
    (url) => {
      expect(() => assertApiBaseUrlAllowed(url, 'debug')).toThrow(InsecureApiBaseUrlError);
    },
  );
});
