import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import {
  storeCredentialOnKeys,
  adoptCredential,
  resolveCredential,
  readDecryptedCredential,
  deleteCredentialPersist,
  expireCredentialPersist,
} from './credentialStore.mjs';

const sessionKey = `session:test-${Date.now()}`;
const userKey = `user:test-${Date.now()}`;

after(async () => {
  await deleteCredentialPersist(sessionKey);
  await deleteCredentialPersist(userKey);
});

describe('market-data credential identity', () => {
  it('keeps the session copy after login adopt so logout still sees LIVE', async () => {
    await storeCredentialOnKeys([sessionKey], {
      provider: 'indstocks',
      credentialPayload: { kind: 'indstocks', accessToken: 'test-token-not-real-xx', v: 1 },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      capabilities: { historicalCandles: true, liveQuotes: true },
      mode: 'LIVE',
      status: 'CONNECTED',
      permissionNote: null,
    });

    await adoptCredential(sessionKey, userKey);

    const afterLogin = await resolveCredential([userKey, sessionKey]);
    assert.equal(afterLogin.record?.status, 'CONNECTED');
    assert.equal(afterLogin.record?.mode, 'LIVE');

    const afterLogout = await resolveCredential([sessionKey]);
    assert.equal(afterLogout.key, sessionKey);
    assert.equal(afterLogout.record?.status, 'CONNECTED');
    assert.equal(readDecryptedCredential(sessionKey)?.accessToken, 'test-token-not-real-xx');
    assert.equal(readDecryptedCredential(userKey)?.accessToken, 'test-token-not-real-xx');
  });

  it('writes user + session together and expires both when the broker token dies', async () => {
    await storeCredentialOnKeys([userKey, sessionKey], {
      provider: 'indstocks',
      credentialPayload: { kind: 'indstocks', accessToken: 'test-token-not-real-yy', v: 1 },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      capabilities: { historicalCandles: true, liveQuotes: true },
      mode: 'LIVE',
      status: 'CONNECTED',
      permissionNote: null,
    });

    await expireCredentialPersist(userKey);
    await expireCredentialPersist(sessionKey);

    const user = await resolveCredential([userKey]);
    const session = await resolveCredential([sessionKey]);
    assert.equal(user.record?.status, 'EXPIRED');
    assert.equal(session.record?.status, 'EXPIRED');
  });
});
