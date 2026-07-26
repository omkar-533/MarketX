/**
 * Provider-agnostic OTP delivery. Switching provider is one env var
 * (SMS_PROVIDER=fast2sms|msg91|dev) — no caller changes.
 *
 * fast2sms: OTP route, runs on Fast2SMS's own DLT template (no DLT work for us).
 * msg91:    OTP API, needs a DLT-approved template id.
 * dev:      nothing is sent; the code is logged and returned to the caller so the
 *           flow stays usable until a provider key is configured.
 */

function trim(value) {
  return String(value || '').trim();
}

export function smsProviderName() {
  const explicit = trim(process.env.SMS_PROVIDER).toLowerCase();
  if (explicit) return explicit;
  if (trim(process.env.FAST2SMS_API_KEY)) return 'fast2sms';
  if (trim(process.env.MSG91_AUTH_KEY)) return 'msg91';
  return 'dev';
}

export function isDevSmsMode() {
  return smsProviderName() === 'dev';
}

/** Providers want the bare 10-digit number, not E.164. */
function localNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function sendViaFast2Sms(phone, code) {
  const apiKey = trim(process.env.FAST2SMS_API_KEY);
  if (!apiKey) throw Object.assign(new Error('FAST2SMS_API_KEY missing'), { status: 500 });

  const params = new URLSearchParams({
    route: 'otp',
    variables_values: code,
    numbers: localNumber(phone),
    flash: '0',
  });

  const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
    method: 'GET',
    headers: { authorization: apiKey },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.return === false) {
    const message = body?.message || `Fast2SMS error ${res.status}`;
    throw Object.assign(new Error(Array.isArray(message) ? message.join(', ') : message), {
      status: 502,
    });
  }
  return { provider: 'fast2sms', id: body?.request_id ?? null };
}

async function sendViaMsg91(phone, code) {
  const authKey = trim(process.env.MSG91_AUTH_KEY);
  const templateId = trim(process.env.MSG91_TEMPLATE_ID);
  if (!authKey || !templateId) {
    throw Object.assign(new Error('MSG91_AUTH_KEY or MSG91_TEMPLATE_ID missing'), { status: 500 });
  }

  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      template_id: templateId,
      mobile: `91${localNumber(phone)}`,
      otp: code,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || String(body?.type).toLowerCase() === 'error') {
    throw Object.assign(new Error(body?.message || `MSG91 error ${res.status}`), { status: 502 });
  }
  return { provider: 'msg91', id: body?.request_id ?? null };
}

/**
 * @returns {Promise<{ provider: string, devCode?: string }>} devCode is only set
 * when no provider is configured, so the UI can still complete verification.
 */
export async function sendOtpSms(phone, code) {
  const provider = smsProviderName();

  if (provider === 'fast2sms') return sendViaFast2Sms(phone, code);
  if (provider === 'msg91') return sendViaMsg91(phone, code);

  console.warn(
    `[OTP] No SMS provider configured — code for ${phone} is ${code}. ` +
      'Set SMS_PROVIDER + FAST2SMS_API_KEY to send real messages.',
  );
  return { provider: 'dev', devCode: code };
}
