/**
 * End-to-end smoke test for the forgot-password flow.
 *
 *   node scripts/check-password-reset.mjs [baseUrl]
 *
 * Signs up a throwaway account, resets its password over mobile OTP, and checks
 * that the old password dies while the new one signs in from email and mobile.
 * Needs the dev SMS mode (no provider key) so the OTP comes back in the response.
 */

const base = process.argv[2] || process.env.API_BASE || 'http://localhost:4000';
const adminEmail = process.env.ADMIN_EMAIL || 'omkarchauhan533@gmail.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Omkar@12345';

const stamp = Date.now();
const user = {
  name: 'Reset Test',
  email: `resettest_${stamp}@example.com`,
  phone: String(9000000000 + (stamp % 99999999)),
  password: 'oldpass123',
};
const NEW_PASSWORD = 'newpass456';

let failures = 0;

function log(ok, label, extra = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
}

async function call(path, { method = 'GET', body, token, admin } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'X-Admin-Email': adminEmail, 'X-Admin-Password': adminPassword } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log(`Testing ${base}\n`);

  const start = await call('/api/app-auth/signup/start', { method: 'POST', body: user });
  if (!start.data.devCode) {
    console.error('\nNo devCode — an SMS provider is configured, so this script cannot continue.');
    process.exit(1);
  }
  const created = await call('/api/app-auth/signup/verify', {
    method: 'POST',
    body: { phone: start.data.phone, code: start.data.devCode },
  });
  log(created.status === 201, 'test account created', created.data.error);

  // The OTP throttle is per number, so the signup code has to age out first.
  console.log('waiting out the 45s OTP cooldown...');
  await new Promise((done) => setTimeout(done, 47_000));

  const unknown = await call('/api/app-auth/password/forgot', {
    method: 'POST',
    body: { identifier: '9999999999' },
  });
  log(unknown.status === 404, 'unknown mobile is rejected', unknown.data.error);

  const emailBlocked = await call('/api/app-auth/password/forgot', {
    method: 'POST',
    body: { identifier: user.email },
  });
  log(
    emailBlocked.status === 400,
    'email identifier is rejected',
    emailBlocked.data.error,
  );

  const forgot = await call('/api/app-auth/password/forgot', {
    method: 'POST',
    body: { identifier: user.phone },
  });
  log(forgot.status === 200 && Boolean(forgot.data.devCode), 'forgot sends a code', forgot.data.error);
  log(
    typeof forgot.data.phoneMasked === 'string' &&
      forgot.data.phoneMasked.includes('••••') &&
      !forgot.data.phoneMasked.includes(user.phone.slice(2, 6)),
    'response masks the mobile number',
    forgot.data.phoneMasked,
  );

  const wrong = await call('/api/app-auth/password/reset', {
    method: 'POST',
    body: { identifier: user.phone, code: '000000', password: NEW_PASSWORD },
  });
  log(wrong.status === 400, 'wrong code is rejected', wrong.data.error);

  const short = await call('/api/app-auth/password/reset', {
    method: 'POST',
    body: { identifier: user.phone, code: forgot.data.devCode, password: 'abc' },
  });
  log(short.status === 400, 'short password is rejected', short.data.error);

  const reset = await call('/api/app-auth/password/reset', {
    method: 'POST',
    body: { identifier: user.phone, code: forgot.data.devCode, password: NEW_PASSWORD },
  });
  log(reset.status === 200 && Boolean(reset.data.token), 'reset succeeds', reset.data.error);
  log(Boolean(reset.data?.access), 'reset returns the access snapshot', reset.data?.access?.status);

  const replay = await call('/api/app-auth/password/reset', {
    method: 'POST',
    body: { identifier: user.phone, code: forgot.data.devCode, password: 'another123' },
  });
  log(replay.status === 400, 'the same code cannot be reused', replay.data.error);

  const oldPass = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.email, password: user.password },
  });
  log(oldPass.status === 401, 'old password no longer works');

  const newByEmail = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.email, password: NEW_PASSWORD },
  });
  log(newByEmail.status === 200, 'new password works with the email', newByEmail.data.error);

  const newByPhone = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.phone, password: NEW_PASSWORD },
  });
  log(newByPhone.status === 200, 'new password works with the mobile', newByPhone.data.error);

  const byMobile = await call('/api/app-auth/password/forgot', {
    method: 'POST',
    body: { identifier: user.phone },
  });
  log(
    byMobile.status === 200 || byMobile.status === 429,
    'forgot accepts the mobile number again',
    byMobile.data.error,
  );

  const adminReset = await call('/api/app-auth/password/forgot', {
    method: 'POST',
    body: { identifier: adminEmail },
  });
  log(
    adminReset.status === 400,
    'email (desk admin) cannot start password reset',
    adminReset.data.error,
  );

  const users = await call('/api/app-auth/admin/users', { admin: true });
  const row = (users.data.users || []).find((u) => u.email === user.email);
  if (row) {
    await call(`/api/app-auth/admin/users/${row.id}`, { method: 'DELETE', admin: true });
    console.log('\ncleaned up test account');
  }

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('Reset test crashed:', err.message);
  process.exit(1);
});
