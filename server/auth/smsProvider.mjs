/**
 * SMS OTP delivery.
 *
 * Env:
 *   SMS_PROVIDER=msg91|twilio|dev
 *
 * MSG91 (preferred for India — https://control.msg91.com/):
 *   MSG91_AUTH_KEY=
 *   MSG91_TEMPLATE_ID=          (OTP template id from MSG91 → OTP → Templates)
 *   MSG91_SENDER_ID=            (optional; default SMSIND / template sender)
 *
 * Twilio (legacy):
 *   TWILIO_ACCOUNT_SID=
 *   TWILIO_AUTH_TOKEN=  — or — TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET
 *   TWILIO_FROM_NUMBER= / TWILIO_MESSAGING_SERVICE_SID=
 */

function trim(value) {
  return String(value || '').trim();
}

function hasMsg91Creds() {
  return Boolean(trim(process.env.MSG91_AUTH_KEY) && trim(process.env.MSG91_TEMPLATE_ID));
}

function hasTwilioCreds() {
  const accountSid = trim(process.env.TWILIO_ACCOUNT_SID);
  if (!accountSid) return false;
  if (trim(process.env.TWILIO_API_KEY_SID) && trim(process.env.TWILIO_API_KEY_SECRET)) return true;
  if (trim(process.env.TWILIO_AUTH_TOKEN)) return true;
  return false;
}

function twilioBasicAuth() {
  const apiKeySid = trim(process.env.TWILIO_API_KEY_SID);
  const apiKeySecret = trim(process.env.TWILIO_API_KEY_SECRET);
  if (apiKeySid && apiKeySecret) return { user: apiKeySid, pass: apiKeySecret };

  const accountSid = trim(process.env.TWILIO_ACCOUNT_SID);
  const authToken = trim(process.env.TWILIO_AUTH_TOKEN);
  if (accountSid && authToken) return { user: accountSid, pass: authToken };

  return null;
}

export function smsProviderName() {
  const explicit = trim(process.env.SMS_PROVIDER).toLowerCase();
  if (explicit === 'dev') return 'dev';
  if (explicit === 'msg91') return 'msg91';
  if (explicit === 'twilio') return 'twilio';
  if (hasMsg91Creds()) return 'msg91';
  if (hasTwilioCreds()) return 'twilio';
  return 'dev';
}

export function isDevSmsMode() {
  const provider = smsProviderName();
  if (provider === 'msg91' && hasMsg91Creds()) return false;
  if (provider === 'twilio' && hasTwilioCreds()) return false;
  return true;
}

/** Indian 10-digit → E.164 (+91…) */
export function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return '';
  return `+91${local}`;
}

/** MSG91 wants 91XXXXXXXXXX (no +). */
function toMsg91Mobile(phone) {
  const e164 = toE164(phone);
  return e164 ? e164.replace(/^\+/, '') : '';
}

function localNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function sendViaMsg91(phone, code) {
  const authkey = trim(process.env.MSG91_AUTH_KEY);
  const templateId = trim(process.env.MSG91_TEMPLATE_ID);
  const senderId = trim(process.env.MSG91_SENDER_ID);

  if (!authkey || !templateId) {
    throw Object.assign(new Error('Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID on Render'), {
      status: 500,
    });
  }

  const mobile = toMsg91Mobile(phone);
  if (!mobile) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }

  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('otp', String(code));
  url.searchParams.set('otp_length', '6');
  url.searchParams.set('otp_expiry', '10');
  if (senderId) url.searchParams.set('sender', senderId);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authkey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  const type = String(data?.type || data?.status || '').toLowerCase();
  const ok =
    res.ok && (type === 'success' || type === 'ok' || Boolean(data?.request_id || data?.message));

  // MSG91 sometimes returns 200 with type:"error"
  if (!ok || type === 'error') {
    const message =
      data?.message || data?.msg || data?.error || `MSG91 error ${res.status || ''}`.trim();
    throw Object.assign(new Error(String(message)), { status: 502 });
  }

  return {
    provider: 'msg91',
    id: data?.request_id || data?.message || null,
  };
}

async function sendViaTwilio(phone, code) {
  const accountSid = trim(process.env.TWILIO_ACCOUNT_SID);
  const messagingServiceSid = trim(process.env.TWILIO_MESSAGING_SERVICE_SID);
  const fromNumber = trim(process.env.TWILIO_FROM_NUMBER);
  const basic = twilioBasicAuth();

  if (!accountSid || !basic) {
    throw Object.assign(
      new Error(
        'Set TWILIO_ACCOUNT_SID and either TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET',
      ),
      { status: 500 },
    );
  }
  if (!messagingServiceSid && !fromNumber) {
    throw Object.assign(
      new Error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER'),
      { status: 500 },
    );
  }

  const to = toE164(phone);
  if (!to) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }

  const body = new URLSearchParams({
    To: to,
    Body: `Your Wolf Trade AI code is ${code}. Valid for 10 minutes.`,
  });
  if (messagingServiceSid) body.set('MessagingServiceSid', messagingServiceSid);
  else body.set('From', fromNumber);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${basic.user}:${basic.pass}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error_message || `Twilio error ${res.status}`;
    throw Object.assign(new Error(message), { status: 502 });
  }
  return { provider: 'twilio', id: data?.sid ?? null };
}

/**
 * @returns {Promise<{ provider: string, devCode?: string }>}
 */
export async function sendOtpSms(phone, code) {
  const provider = smsProviderName();

  if (provider === 'msg91' && hasMsg91Creds()) return sendViaMsg91(phone, code);
  if (provider === 'twilio' && hasTwilioCreds()) return sendViaTwilio(phone, code);

  console.warn(
    `[OTP] SMS provider not configured — code for ${localNumber(phone)} is ${code}. ` +
      'Set SMS_PROVIDER=msg91 with MSG91_AUTH_KEY + MSG91_TEMPLATE_ID on Render.',
  );
  return { provider: 'dev', devCode: code };
}
