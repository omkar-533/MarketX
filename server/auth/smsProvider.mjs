/**
 * SMS OTP via Twilio (works with the same Twilio account you connect in
 * Supabase → Auth → Phone). Fast2SMS / MSG91 removed.
 *
 * Env:
 *   SMS_PROVIDER=twilio|dev
 *   TWILIO_ACCOUNT_SID=
 *   TWILIO_AUTH_TOKEN=                 (Account Auth Token)
 *   — or —
 *   TWILIO_API_KEY_SID=SK...           (preferred if Auth Token fails)
 *   TWILIO_API_KEY_SECRET=
 *   TWILIO_MESSAGING_SERVICE_SID=      (preferred)
 *   — or —
 *   TWILIO_FROM_NUMBER=+1...           (Twilio phone / alphanumeric sender)
 */

function trim(value) {
  return String(value || '').trim();
}

function hasTwilioCreds() {
  const accountSid = trim(process.env.TWILIO_ACCOUNT_SID);
  if (!accountSid) return false;
  if (trim(process.env.TWILIO_API_KEY_SID) && trim(process.env.TWILIO_API_KEY_SECRET)) return true;
  if (trim(process.env.TWILIO_AUTH_TOKEN)) return true;
  return false;
}

/** Basic auth user/pass — API Key preferred over Account Auth Token. */
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
  if (explicit === 'twilio') return 'twilio';
  if (hasTwilioCreds()) return 'twilio';
  return 'dev';
}

export function isDevSmsMode() {
  if (smsProviderName() === 'twilio' && hasTwilioCreds()) return false;
  return true;
}

/** Indian 10-digit → E.164 (+91…) */
export function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return '';
  return `+91${local}`;
}

function localNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
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

  if (provider === 'twilio' && hasTwilioCreds()) return sendViaTwilio(phone, code);

  console.warn(
    `[OTP] Twilio not configured — code for ${localNumber(phone)} is ${code}. ` +
      'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or API Key SID+Secret) on Render. ' +
      'Same Twilio account can be connected in Supabase → Auth → Phone.',
  );
  return { provider: 'dev', devCode: code };
}
