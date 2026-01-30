import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Simple polling-based refresh hook - more reliable than Realtime.
 * Use this instead of Realtime subscriptions to avoid AbortError issues.
 */
export function usePollingRefresh(
  callback: () => void,
  intervalMs: number = 30000,
  enabled: boolean = true
) {
  const isMountedRef = useRef(true);
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    
    isMountedRef.current = true;
    
    // Initial call
    callbackRef.current();
    
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        callbackRef.current();
      }
    }, intervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [intervalMs, enabled]);
}

/**
 * Safe wrapper for Supabase Realtime channel subscription.
 * Handles AbortError gracefully during component unmount.
 */
export async function createSafeChannel(
  channelName: string,
  table: string,
  onEvent: () => void,
  isMountedRef: React.MutableRefObject<boolean>
) {
  try {
    const channel = supabase.channel(channelName);
    
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        if (isMountedRef.current) {
          onEvent();
        }
      }
    );
    
    if (isMountedRef.current) {
      await channel.subscribe();
      return channel;
    } else {
      supabase.removeChannel(channel);
      return null;
    }
  } catch (error) {
    // Silently handle AbortError - it's expected during fast navigation
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Realtime subscription error:', error);
    }
    return null;
  }
}

/**
 * Safely remove a Supabase Realtime channel.
 */
export function removeSafeChannel(channel: ReturnType<typeof supabase.channel> | null) {
  if (channel) {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Ignore cleanup errors
    }
  }
}
