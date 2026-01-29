-- ============================================
-- Fase 4: Visual Flow Builder - Database Schema
-- ============================================

-- Create automation_flows table
CREATE TABLE public.automation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  nodes_json JSONB NOT NULL DEFAULT '[]',
  edges_json JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT false,
  is_draft BOOLEAN DEFAULT true,
  total_executions INTEGER DEFAULT 0,
  successful_executions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create flow_executions table for execution history
CREATE TABLE public.flow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  current_node_id TEXT,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  execution_log JSONB DEFAULT '[]',
  error_message TEXT
);

-- Create indexes for performance
CREATE INDEX idx_automation_flows_trigger_type ON public.automation_flows(trigger_type);
CREATE INDEX idx_automation_flows_is_active ON public.automation_flows(is_active);
CREATE INDEX idx_flow_executions_flow_id ON public.flow_executions(flow_id);
CREATE INDEX idx_flow_executions_client_id ON public.flow_executions(client_id);
CREATE INDEX idx_flow_executions_status ON public.flow_executions(status);

-- Enable RLS
ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for automation_flows
CREATE POLICY "Admin can manage automation_flows"
  ON public.automation_flows
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- RLS policies for flow_executions
CREATE POLICY "Admin can manage flow_executions"
  ON public.flow_executions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Create updated_at trigger for automation_flows
CREATE TRIGGER update_automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();