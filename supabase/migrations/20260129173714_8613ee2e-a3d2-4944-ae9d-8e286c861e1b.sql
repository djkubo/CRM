-- =============================================
-- FASE 1: SISTEMA MULTIAGENTE
-- =============================================

-- Tabla de agentes (usuarios que pueden atender chats)
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  max_chats INTEGER NOT NULL DEFAULT 10,
  current_chats INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de conversaciones (agrupa chat_events por contacto)
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  first_message_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_customer_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_bot_active BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de asignaciones (historial de quién atendió qué)
CREATE TABLE public.chat_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.agents(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMP WITH TIME ZONE,
  reason TEXT,
  notes TEXT
);

-- Índices para performance
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_conversations_assigned_agent ON public.conversations(assigned_agent_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_chat_assignments_conversation ON public.chat_assignments(conversation_id);
CREATE INDEX idx_chat_assignments_agent ON public.chat_assignments(agent_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_assignments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (admin puede ver todo, agentes ven lo asignado)
CREATE POLICY "Admins can manage agents"
  ON public.agents FOR ALL
  USING (public.is_admin());

CREATE POLICY "Agents can view themselves"
  ON public.agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can update their status"
  ON public.agents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage conversations"
  ON public.conversations FOR ALL
  USING (public.is_admin());

CREATE POLICY "Agents can view assigned conversations"
  ON public.conversations FOR SELECT
  USING (
    assigned_agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Agents can update assigned conversations"
  ON public.conversations FOR UPDATE
  USING (
    assigned_agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admins can manage assignments"
  ON public.chat_assignments FOR ALL
  USING (public.is_admin());

CREATE POLICY "Agents can view their assignments"
  ON public.chat_assignments FOR SELECT
  USING (
    agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- Enable realtime for conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;