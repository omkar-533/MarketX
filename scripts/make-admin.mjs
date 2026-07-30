/**
 * Promote a member to admin by mobile number.
 *
 *   node scripts/make-admin.mjs 9565182344
 */
import { loadServerEnv } from '../server/loadEnv.mjs';
import { findAppUserByPhone, setAppUserRole, setUserAccess } from '../server/auth/appUserStore.mjs';

loadServerEnv();

const phone = String(process.argv[2] || '').replace(/\D/g, '').slice(-10);
if (!/^[6-9]\d{9}$/.test(phone)) {
  console.error('Usage: node scripts/make-admin.mjs <10-digit-mobile>');
  process.exit(1);
}

const user = await findAppUserByPhone(phone);
if (!user) {
  console.error(`No account found for +91${phone}`);
  process.exit(1);
}

const promoted = await setAppUserRole(user.id, 'admin');
await setUserAccess(user.id, { status: 'granted', days: 0 });

console.log('Promoted to admin:', {
  id: promoted.id,
  name: promoted.name,
  email: promoted.email,
  phone: promoted.phone,
  role: promoted.role,
});
