/**
 * Single source of truth for "is this account allowed into the workspace".
 * Derived on read so an expired trial locks itself without any cron job.
 */
export function accessStateFor(user) {
  if (!user) {
    return {
      status: 'locked',
      unlocked: false,
      isTrial: false,
      expiresAt: null,
      daysLeft: null,
      hoursLeft: null,
      reason: 'no_account',
    };
  }

  if (user.role === 'admin' || user.role === 'subadmin') {
    return {
      status: 'granted',
      unlocked: true,
      isTrial: false,
      expiresAt: null,
      daysLeft: null,
      hoursLeft: null,
      reason: null,
    };
  }

  const status = user.accessStatus || 'trial';
  const expiresAt = user.accessExpiresAt || null;
  const expMs = expiresAt ? Date.parse(expiresAt) : null;
  const msLeft = expMs ? expMs - Date.now() : null;
  const expired = msLeft !== null && msLeft <= 0;
  const blocked = status === 'blocked' || user.active === false;
  const unlocked = !blocked && (status === 'trial' || status === 'granted') && !expired;

  let reason = null;
  if (blocked) reason = 'blocked';
  else if (!unlocked) reason = status === 'trial' ? 'trial_expired' : 'access_expired';

  return {
    status: blocked ? 'blocked' : unlocked ? status : 'locked',
    unlocked,
    isTrial: status === 'trial',
    expiresAt,
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / 86_400_000)),
    hoursLeft: msLeft === null ? null : Math.max(0, Math.floor(msLeft / 3_600_000)),
    reason,
  };
}
