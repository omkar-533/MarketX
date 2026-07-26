/**
 * End-to-end smoke test for the trial / OTP / admin-approval flow.
 *
 *   node scripts/check-access-flow.mjs [baseUrl]
 *
 * Runs against a live API (default http://localhost:4000) and walks the whole
 * path: OTP signup → trial access → proof upload → admin approve → lock → login.
 * Needs the dev SMS mode (no provider key) so the OTP comes back in the response.
 */

const base = process.argv[2] || process.env.API_BASE || 'http://localhost:4000';
const adminEmail = process.env.ADMIN_EMAIL || 'omkarchauhan533@gmail.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Omkar@12345';

const stamp = Date.now();
const user = {
  name: 'Flow Test',
  email: `flowtest_${stamp}@example.com`,
  phone: String(9000000000 + (stamp % 99999999)),
  password: 'test1234',
};

// 1×1 transparent PNG
const SCREENSHOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

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
  log(start.status === 200 && Boolean(start.data.devCode), 'signup/start sends an OTP', start.data.error);
  if (!start.data.devCode) {
    console.error('\nNo devCode — an SMS provider is configured, so this script cannot continue.');
    process.exit(1);
  }

  const wrong = await call('/api/app-auth/signup/verify', {
    method: 'POST',
    body: { phone: start.data.phone, code: '000000' },
  });
  log(wrong.status === 400, 'wrong OTP is rejected', wrong.data.error);

  const verify = await call('/api/app-auth/signup/verify', {
    method: 'POST',
    body: { phone: start.data.phone, code: start.data.devCode },
  });
  const token = verify.data.token;
  log(verify.status === 201 && Boolean(token), 'signup/verify creates the account', verify.data.error);
  log(verify.data?.access?.unlocked === true, 'new account starts unlocked');
  log(verify.data?.access?.status === 'trial', 'new account is on trial', verify.data?.access?.status);
  log(
    verify.data?.access?.daysLeft === Number(process.env.TRIAL_DAYS || 3),
    'trial length matches TRIAL_DAYS',
    String(verify.data?.access?.daysLeft),
  );
  log(verify.data?.user?.phone === `+91${user.phone}`, 'mobile stored in E.164', verify.data?.user?.phone);

  const dupe = await call('/api/app-auth/signup/start', { method: 'POST', body: user });
  log(dupe.status === 409, 'duplicate email/mobile is blocked', dupe.data.error);

  const access = await call('/api/app-auth/access', { token });
  log(access.status === 200 && access.data.access.unlocked, 'GET /access reports live state');

  const proof = await call('/api/app-auth/access/request', {
    method: 'POST',
    token,
    body: { screenshot: SCREENSHOT, note: 'flow test' },
  });
  log(proof.status === 201, 'screenshot upload accepted', proof.data.error);
  log(proof.data?.access?.request?.status === 'pending', 'request is pending review');

  const list = await call('/api/app-auth/admin/access-requests?status=pending', { admin: true });
  const mine = (list.data.requests || []).find((r) => r.email === user.email);
  log(Boolean(mine), 'admin sees the pending request');

  const unauth = await call('/api/app-auth/admin/access-requests');
  log(unauth.status === 401, 'admin routes need admin auth');

  if (mine) {
    const approve = await call(`/api/app-auth/admin/access-requests/${mine.id}/approve`, {
      method: 'POST',
      admin: true,
      body: { days: 30 },
    });
    log(approve.status === 200, 'admin approves the request', approve.data.error);

    const after = await call('/api/app-auth/access', { token });
    log(after.data?.access?.status === 'granted', 'approval grants access', after.data?.access?.status);
    log(after.data?.access?.daysLeft === 30, 'granted for the requested days', String(after.data?.access?.daysLeft));
  }

  const users = await call('/api/app-auth/admin/users', { admin: true });
  const row = (users.data.users || []).find((u) => u.email === user.email);
  log(Boolean(row?.phone), 'admin user list exposes the mobile number');
  log(Boolean(row?.firstLoginAt), 'first login is recorded');
  log(row?.adminSeenAt == null, 'new user is flagged as unseen');

  if (row) {
    const locked = await call(`/api/app-auth/admin/users/${row.id}/access`, {
      method: 'POST',
      admin: true,
      body: { status: 'locked' },
    });
    log(locked.status === 200, 'admin can lock an account', locked.data.error);

    const afterLock = await call('/api/app-auth/access', { token });
    log(afterLock.data?.access?.unlocked === false, 'locked account is gated');

    await call(`/api/app-auth/admin/users/${row.id}/access`, {
      method: 'POST',
      admin: true,
      body: { status: 'granted', days: 30 },
    });
  }

  const byPhone = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.phone, password: user.password },
  });
  log(byPhone.status === 200 && Boolean(byPhone.data.token), 'login works with the mobile number', byPhone.data.error);

  const byEmail = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.email, password: user.password },
  });
  log(byEmail.status === 200, 'login works with the email', byEmail.data.error);
  log(Number(byEmail.data?.user?.loginCount) >= 2, 'login count increments', String(byEmail.data?.user?.loginCount));

  const badPass = await call('/api/app-auth/login', {
    method: 'POST',
    body: { identifier: user.email, password: 'nope' },
  });
  log(badPass.status === 401, 'wrong password is rejected');

  if (row) {
    await call(`/api/app-auth/admin/users/${row.id}`, { method: 'DELETE', admin: true });
  }

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('Flow test crashed:', err.message);
  process.exit(1);
});
