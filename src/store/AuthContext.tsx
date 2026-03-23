import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';

interface AuthContextType {
  session: Session | null;
  profile: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
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
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message || null };
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!session?.user) return;
    await supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (profile) {
      setProfile({ ...profile, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut, updateProfile, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
