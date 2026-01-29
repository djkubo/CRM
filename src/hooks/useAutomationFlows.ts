import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface AutomationFlow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Json;
  nodes_json: Json;
  edges_json: Json;
  is_active: boolean;
  is_draft: boolean;
  total_executions: number;
  successful_executions: number;
  created_at: string;
  updated_at: string;
}

export interface FlowExecution {
  id: string;
  flow_id: string;
  client_id: string | null;
  trigger_event: string;
  current_node_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  execution_log: Json;
  error_message: string | null;
}

export function useAutomationFlows() {
  return useQuery({
    queryKey: ['automation-flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_flows')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as AutomationFlow[];
    },
  });
}

export function useAutomationFlow(id: string | null) {
  return useQuery({
    queryKey: ['automation-flow', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as AutomationFlow;
    },
    enabled: !!id,
  });
}

export function useFlowExecutions(flowId: string | null) {
  return useQuery({
    queryKey: ['flow-executions', flowId],
    queryFn: async () => {
      if (!flowId) return [];
      
      const { data, error } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('flow_id', flowId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as FlowExecution[];
    },
    enabled: !!flowId,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (flow: {
      name: string;
      description?: string;
      trigger_type: string;
      trigger_config?: Json;
    }) => {
      const { data, error } = await supabase
        .from('automation_flows')
        .insert({
          name: flow.name,
          description: flow.description || null,
          trigger_type: flow.trigger_type,
          trigger_config: flow.trigger_config || {},
          nodes_json: [],
          edges_json: [],
          is_draft: true,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      toast({ title: 'Flujo creado', description: 'El flujo se ha creado correctamente' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<AutomationFlow> & { id: string }) => {
      const { data, error } = await supabase
        .from('automation_flows')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationFlow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      queryClient.invalidateQueries({ queryKey: ['automation-flow', data.id] });
    },
    onError: (error) => {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useToggleFlowActive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('automation_flows')
        .update({ is_active, is_draft: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationFlow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      queryClient.invalidateQueries({ queryKey: ['automation-flow', data.id] });
      toast({
        title: data.is_active ? 'Flujo activado' : 'Flujo desactivado',
        description: data.is_active 
          ? 'El flujo ahora se ejecutará automáticamente' 
          : 'El flujo ya no se ejecutará',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('automation_flows')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      toast({ title: 'Flujo eliminado', description: 'El flujo se ha eliminado correctamente' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDuplicateFlow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // First fetch the original flow
      const { data: original, error: fetchError } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!original) throw new Error('Flow not found');

      // Create a copy
      const { data, error } = await supabase
        .from('automation_flows')
        .insert({
          name: `${original.name} (copia)`,
          description: original.description,
          trigger_type: original.trigger_type,
          trigger_config: original.trigger_config,
          nodes_json: original.nodes_json,
          edges_json: original.edges_json,
          is_draft: true,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      toast({ title: 'Flujo duplicado', description: 'Se ha creado una copia del flujo' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
