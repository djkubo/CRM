import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Use ref to track session for interval/visibility without triggering re-renders
  const sessionRef = useRef<Session | null>(null);

  // Session refresh function to prevent expiration
  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[Auth] Session refresh error:', error);
        return false;
      }
      if (data.session) {
        sessionRef.current = data.session;
        setSession(data.session);
        setUser(data.session.user);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Auth] Session refresh failed:', e);
      return false;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('[Auth] State change:', event);
        sessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      sessionRef.current = existingSession;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
    });

    // Auto-refresh session every 10 minutes to prevent expiration
    const refreshInterval = setInterval(() => {
      if (sessionRef.current) {
        console.log('[Auth] Auto-refresh interval triggered');
        supabase.auth.refreshSession();
      }
    }, 10 * 60 * 1000); // 10 minutes

    // Also refresh on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionRef.current) {
        console.log('[Auth] Tab visible - refreshing session');
        supabase.auth.refreshSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // NO dependencies - only run once on mount

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshSession,
    isAuthenticated: !!session,
  };
}
