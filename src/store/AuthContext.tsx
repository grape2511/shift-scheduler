import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';

interface AuthContextType {
  session: Session | null;
  profile: User | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  signUp: (email: string, password: string, name: string, role?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const COLORS = ['#8b5cf6', '#ec4899', '#22c55e', '#f97316', '#3b82f6', '#ef4444', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16'];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email || '',
    role: data.role as User['role'],
    color: data.color,
    country: data.country || undefined,
    timezone: data.timezone || undefined,
    enabledHolidayCountries: data.enabled_holiday_countries || undefined,
    ptoAllowance: data.pto_allowance ?? 21,
    slackWebhookUrl: data.slack_webhook_url || undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Check if URL contains recovery token
    if (window.location.hash.includes('type=recovery')) {
      setIsPasswordRecovery(true);
    }

    let mounted = true;

    // Initialize session
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id).then(p => {
            if (mounted) setProfile(p);
          });
        }
      } catch {
        // Session expired or invalid - that's fine, show login
      }
      if (mounted) setLoading(false);
    };

    // Start init with a race against a timeout
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    init().then(() => clearTimeout(timeout));

    // Listen for subsequent auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      if (!mounted) return;
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).then(p => {
          if (mounted) setProfile(p);
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, name: string, role = 'agent') => {
    const color = getRandomColor();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, color },
      },
    });
    return { error: error?.message || null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error: error?.message || null };
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const result = await Promise.race([
        supabase.auth.updateUser({ password: newPassword }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please try again.')), 10000)),
      ]);
      if (!result.error) {
        setIsPasswordRecovery(false);
        return { error: null };
      }
      return { error: result.error.message };
    } catch (e: any) {
      // On timeout or error, still clear recovery state so user can sign in with new password
      // (the password may have actually been updated)
      setIsPasswordRecovery(false);
      return { error: e?.message || 'Failed to update password' };
    }
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const updateProfile = async (updates: Partial<User>) => {
    if (!session?.user) return;
    await supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (profile) {
      setProfile({ ...profile, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, isPasswordRecovery, signUp, signIn, signInWithGoogle, signOut, updateProfile, resetPassword, updatePassword, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
