import { useCallback, useEffect, useRef, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import {
  clearAppSession,
  completePasswordReset,
  fetchAccessState,
  loadAppSession,
  loginWithInvite,
  resendPasswordResetOtp,
  resendSignupOtp,
  saveAppSession,
  startPasswordReset,
  startSignup,
  verifySignupOtp,
  type AccessSnapshot,
  type AccessStatus,
  type OtpChallenge,
  type ResetChallenge,
} from '../services/appInviteAuth';
import {
  clearProfileAvatar,
  compressProfileImage,
  loadProfileAvatar,
  saveProfileAvatar,
} from '../services/profileAvatar';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'admin';
  plan: 'free' | 'pro' | 'premium';
  verified: boolean;
  createdAt: string;
  /** Set for self-signup trial accounts — ISO date when full access ends. */
  trialEndsAt?: string | null;
  phoneVerified?: boolean;
  accessStatus?: AccessStatus;
  accessExpiresAt?: string | null;
}

/** Access is rechecked on this cadence so an expiry lands without a reload. */
const ACCESS_POLL_MS = 5 * 60 * 1000;

const ADMIN_EMAIL = 'omkarchauhan533@gmail.com';
const ADMIN_PASSWORD = 'Omkar@12345';
const ADMIN_SESSION_KEY = 'tradeflow_admin_session';

type OtpResult = 'sent' | 'verified';

function createAdminUser(): User {
  return {
    id: 'admin_local_omkar',
    name: 'Omkar Chauhan',
    email: ADMIN_EMAIL,
    role: 'admin',
    plan: 'premium',
    verified: true,
    createdAt: new Date().toISOString(),
  };
}

function isAdminCredentials(email: string, password: string) {
  return (
    email.trim().toLowerCase() === ADMIN_EMAIL &&
    password === ADMIN_PASSWORD
  );
}

function persistAdminSession(user: User) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(user));
}

function restoreAdminSession(): User | null {
  const stored = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as User;
    if (parsed.email !== ADMIN_EMAIL || parsed.role !== 'admin') {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function mapSupabaseUser(user: SupabaseUser | null): User | null {
  if (!user) return null;

  const appMeta = (user.app_metadata ?? {}) as {
    role?: 'user' | 'admin';
    plan?: 'free' | 'pro' | 'premium';
  };

  const userMeta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    phone?: string;
    avatar_url?: string;
  };

  const email = user.email ?? '';
  const isAdminAccount = email.toLowerCase() === ADMIN_EMAIL;
  const name =
    userMeta.full_name ||
    userMeta.name ||
    (isAdminAccount ? 'Omkar Chauhan' : email.split('@')[0]) ||
    'User';

  return {
    id: user.id,
    name,
    email,
    phone: user.phone ?? userMeta.phone,
    avatar: loadProfileAvatar(user.id) || userMeta.avatar_url,
    role: isAdminAccount ? 'admin' : appMeta.role ?? 'user',
    plan: isAdminAccount ? 'premium' : appMeta.plan ?? 'free',
    verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at),
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

function withStoredAvatar(u: User): User {
  return { ...u, avatar: loadProfileAvatar(u.id) || u.avatar };
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | 'otp'>('login');
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessSnapshot | null>(null);
  const loggedInRef = useRef(false);

  loggedInRef.current = isLoggedIn;

  /** Pulls the live gate state; the stored JWT can be days out of date. */
  const refreshAccess = useCallback(async () => {
    try {
      const snapshot = await fetchAccessState();
      setAccess(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }, []);

  const syncSession = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { data } = await supabase.auth.getSession();
    const mappedUser = mapSupabaseUser(data.session?.user ?? null);

    setUser(mappedUser);
    setIsLoggedIn(Boolean(mappedUser));
    if (mappedUser) {
      setShowAuth(false);
    }

    return Boolean(mappedUser);
  }, []);

  const hydrateSession = useCallback(async () => {
    const realSession = await syncSession();
    if (realSession) {
      return true;
    }

    const invite = loadAppSession();
    if (invite?.user) {
      setUser(withStoredAvatar(invite.user));
      setIsLoggedIn(true);
      setShowAuth(false);
      void refreshAccess();
      return true;
    }

    const fallbackUser = restoreAdminSession();
    if (!fallbackUser) {
      return false;
    }

    setUser(withStoredAvatar(fallbackUser));
    setIsLoggedIn(true);
    setShowAuth(false);
    return true;
  }, [refreshAccess, syncSession]);

  useEffect(() => {
    void hydrateSession();

    const supabase = getSupabase();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const mappedUser = mapSupabaseUser(session?.user ?? null);
      if (mappedUser) {
        setUser(mappedUser);
        setIsLoggedIn(true);
        setShowAuth(false);
        return;
      }
      const invite = loadAppSession();
      if (invite?.user) {
        setUser(withStoredAvatar(invite.user));
        setIsLoggedIn(true);
        setShowAuth(false);
        return;
      }
      const fallbackUser = restoreAdminSession();
      if (fallbackUser) {
        setUser(withStoredAvatar(fallbackUser));
        setIsLoggedIn(true);
        setShowAuth(false);
        return;
      }
      setUser(null);
      setIsLoggedIn(false);
    });

    return () => subscription.unsubscribe();
  }, [hydrateSession]);

  const setAdminFallbackSession = useCallback((password?: string) => {
    const adminUser = withStoredAvatar(createAdminUser());
    persistAdminSession(adminUser);
    setUser(adminUser);
    setIsLoggedIn(true);
    setShowAuth(false);
    if (password) setAdminPassword(password);
  }, []);

  const applyAvatarToUser = useCallback((nextAvatar: string | undefined) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, avatar: nextAvatar };
      const invite = loadAppSession();
      if (invite?.user?.id === prev.id) {
        saveAppSession({ ...invite, user: next });
      }
      if (prev.role === 'admin' && prev.email === ADMIN_EMAIL) {
        persistAdminSession(next);
      }
      return next;
    });
  }, []);

  const updateAvatar = useCallback(
    async (input: File | string) => {
      const current = user;
      if (!current) throw new Error('Sign in to set a profile photo');
      const dataUrl = typeof input === 'string' ? input : await compressProfileImage(input);
      if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Could not process photo');
      }
      saveProfileAvatar(current.id, dataUrl);
      applyAvatarToUser(dataUrl);
      return dataUrl;
    },
    [applyAvatarToUser, user],
  );

  const removeAvatar = useCallback(() => {
    const current = user;
    if (!current) return;
    clearProfileAvatar(current.id);
    applyAvatarToUser(undefined);
  }, [applyAvatarToUser, user]);

  /** Strict mobile + password login for every member. No email / Supabase side path. */
  const login = useCallback(
    async (identifier: string, password: string) => {
      const digits = String(identifier || '')
        .replace(/\D/g, '')
        .slice(-10);

      if (!/^[6-9]\d{9}$/.test(digits)) {
        throw new Error('Enter a valid 10-digit mobile number');
      }
      if (!password) {
        throw new Error('Enter your password');
      }

      try {
        const session = await loginWithInvite(digits, password);
        setUser(withStoredAvatar(session.user));
        setAccess(session.snapshot);
        setIsLoggedIn(true);
        setShowAuth(false);
        if (session.user.role === 'admin') setAdminPassword(password);
        void refreshAccess();
        return;
      } catch (err) {
        const raw = err instanceof Error ? err.message : '';
        if (/email/i.test(raw)) {
          throw new Error('Wrong mobile number or password');
        }
        if (/abort|network|failed to fetch|timeout|Load failed/i.test(raw)) {
          throw new Error('Server is waking up — wait a few seconds and try again');
        }
        throw new Error(raw || 'Wrong mobile number or password');
      }
    },
    [refreshAccess],
  );

  /** Step 1 of the trial sign-up: sends an OTP, creates nothing yet. */
  const signupStart = useCallback(
    async (input: {
      name: string;
      email: string;
      phone: string;
      password: string;
    }): Promise<OtpChallenge> =>
      startSignup({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
        password: input.password,
      }),
    [],
  );

  const signupResend = useCallback(
    async (phone: string): Promise<OtpChallenge> => resendSignupOtp(phone),
    [],
  );

  /** Step 2: the verified account is signed in with the free trial already live. */
  const signupVerify = useCallback(async (phone: string, code: string) => {
    const session = await verifySignupOtp(phone, code);
    setUser(withStoredAvatar(session.user));
    setAccess(session.snapshot);
    setIsLoggedIn(true);
    setShowAuth(false);
  }, []);

  const signup = useCallback(async () => {
    throw new Error('Sign-up needs mobile verification — use the free trial button.');
  }, []);

  const logout = useCallback(async () => {
    try {
      await getSupabase()?.auth.signOut();
    } finally {
      clearAdminSession();
      clearAppSession();
      setAdminPassword(null);
      setUser(null);
      setAccess(null);
      setIsLoggedIn(false);
      setShowAuth(false);
    }
  }, []);

  const googleLogin = useCallback(async () => {
    throw new Error('Google sign-in is disabled. Use the email & password from admin.');
  }, []);

  const otpLogin = useCallback(async (_phone: string, _otp: string): Promise<OtpResult> => {
    throw new Error('Phone OTP is disabled. Use the email & password from admin.');
  }, []);

  /** Step 1 of the reset: an OTP goes to the mobile number saved on the account. */
  const resetStart = useCallback(
    async (identifier: string): Promise<ResetChallenge> =>
      startPasswordReset(identifier.trim()),
    [],
  );

  const resetResend = useCallback(
    async (identifier: string): Promise<ResetChallenge> =>
      resendPasswordResetOtp(identifier.trim()),
    [],
  );

  /** Step 2: the new password is saved and the session starts right away. */
  const resetComplete = useCallback(
    async (identifier: string, code: string, password: string) => {
      const session = await completePasswordReset(identifier.trim(), code, password);
      setUser(withStoredAvatar(session.user));
      setAccess(session.snapshot);
      setIsLoggedIn(true);
      setShowAuth(false);
    },
    [],
  );

  const forgotPassword = useCallback(async (identifier: string) => {
    await startPasswordReset(identifier.trim());
  }, []);

  /** An expiry can land mid-session, so recheck on a timer and when the tab wakes. */
  useEffect(() => {
    if (!isLoggedIn) return;

    const timer = window.setInterval(() => {
      if (loggedInRef.current) void refreshAccess();
    }, ACCESS_POLL_MS);

    const onFocus = () => {
      if (document.visibilityState === 'visible' && loggedInRef.current) void refreshAccess();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isLoggedIn, refreshAccess]);

  return {
    user,
    isLoggedIn,
    showAuth,
    authMode,
    setAuthMode,
    setShowAuth,
    login,
    signup,
    signupStart,
    signupVerify,
    signupResend,
    logout,
    googleLogin,
    otpLogin,
    forgotPassword,
    resetStart,
    resetResend,
    resetComplete,
    adminPassword,
    adminEmail: user?.role === 'admin' ? user.email : null,
    access: access?.access ?? null,
    accessPopup: access?.popup ?? null,
    refreshAccess,
    updateAvatar,
    removeAvatar,
  };
}
