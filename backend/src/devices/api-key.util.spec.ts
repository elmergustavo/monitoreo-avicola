import { hashApiKey } from './api-key.util.js';

describe('hashApiKey', () => {
  it('returns the SHA-256 hex digest of the key', () => {
    expect(hashApiKey('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and never returns the key itself', () => {
    const key = 'my-secret-key';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain(key);
  });
});
