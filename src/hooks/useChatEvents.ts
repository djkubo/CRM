import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChatEvent {
  id: number;
  contact_id: string;
  platform: string;
  sender: "user" | "bot";
  message: string | null;
  created_at: string;
  meta: {
    name?: string;
    email?: string;
    [key: string]: unknown;
  } | null;
}

export interface ChatContact {
  contact_id: string;
  name: string | null;
  email: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
}

// Hook to fetch unique contacts with their last message
export function useChatContacts() {
  return useQuery({
    queryKey: ["chat-contacts"],
    queryFn: async (): Promise<ChatContact[]> => {
      // Get all chat events, then aggregate client-side
      const { data, error } = await supabase
        .from("chat_events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by contact_id
      const contactMap = new Map<string, ChatContact>();

      for (const event of data || []) {
        const existing = contactMap.get(event.contact_id);
        const meta = event.meta as ChatEvent["meta"];
        
        if (!existing) {
          contactMap.set(event.contact_id, {
            contact_id: event.contact_id,
            name: meta?.name || null,
            email: meta?.email || null,
            last_message: event.message,
            last_message_at: event.created_at,
            unread_count: event.sender === "user" ? 1 : 0,
          });
        } else {
          // Update name/email if not set and this event has it
          if (!existing.name && meta?.name) {
            existing.name = meta.name;
          }
          if (!existing.email && meta?.email) {
            existing.email = meta.email;
          }
          // Count unread from user
          if (event.sender === "user") {
            existing.unread_count += 1;
          }
        }
      }

      // Convert to array and sort by last_message_at desc
      return Array.from(contactMap.values()).sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    },
  });
}

// Hook to fetch messages for a specific contact
export function useChatMessages(contactId: string | undefined) {
  return useQuery({
    queryKey: ["chat-messages", contactId],
    queryFn: async (): Promise<ChatEvent[]> => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from("chat_events")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as ChatEvent[];
    },
    enabled: !!contactId,
  });
}

// Hook for realtime subscription to chat_events
export function useChatEventsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("chat-events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_events" },
        (payload) => {
          console.log("New chat event:", payload);
          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey: ["chat-contacts"] });
          queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
