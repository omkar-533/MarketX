import { useCallback, useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import {
  clearAppSession,
  loadAppSession,
  loginWithInvite,
} from '../services/appInviteAuth';

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
}

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
    avatar: userMeta.avatar_url,
    role: isAdminAccount ? 'admin' : appMeta.role ?? 'user',
    plan: isAdminAccount ? 'premium' : appMeta.plan ?? 'free',
    verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at),
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | 'otp'>('login');
  const [adminPassword, setAdminPassword] = useState<string | null>(null);

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
      setUser(invite.user);
      setIsLoggedIn(true);
      setShowAuth(false);
      return true;
    }

    const fallbackUser = restoreAdminSession();
    if (!fallbackUser) {
      return false;
    }

    setUser(fallbackUser);
    setIsLoggedIn(true);
    setShowAuth(false);
    return true;
  }, [syncSession]);

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
        setUser(invite.user);
        setIsLoggedIn(true);
        setShowAuth(false);
        return;
      }
      const fallbackUser = restoreAdminSession();
      if (fallbackUser) {
        setUser(fallbackUser);
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
    const adminUser = createAdminUser();
    persistAdminSession(adminUser);
    setUser(adminUser);
    setIsLoggedIn(true);
    setShowAuth(false);
    if (password) setAdminPassword(password);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const supabase = getSupabase();

      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (!error) {
          await hydrateSession();
          return;
        }
      }

      try {
        const session = await loginWithInvite(normalizedEmail, password);
        setUser(session.user);
        setIsLoggedIn(true);
        setShowAuth(false);
        if (session.user.role === 'admin') setAdminPassword(password);
        return;
      } catch {
        /* fall through */
      }

      if (isAdminCredentials(normalizedEmail, password)) {
        setAdminFallbackSession(password);
        return;
      }

      throw new Error('Invalid email or password');
    },
    [hydrateSession, setAdminFallbackSession],
  );

  const signup = useCallback(async () => {
    throw new Error('Public sign-up is disabled. Ask admin for a login.');
  }, []);

  const logout = useCallback(async () => {
    try {
      await getSupabase()?.auth.signOut();
    } finally {
      clearAdminSession();
      clearAppSession();
      setAdminPassword(null);
      setUser(null);
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

  const forgotPassword = useCallback(async () => {
    throw new Error('Password reset is disabled. Contact admin for a new password.');
  }, []);

  return {
    user,
    isLoggedIn,
    showAuth,
    authMode,
    setAuthMode,
    setShowAuth,
    login,
    signup,
    logout,
    googleLogin,
    otpLogin,
    forgotPassword,
    adminPassword,
    adminEmail: user?.role === 'admin' ? user.email : null,
  };
}
