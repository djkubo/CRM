import { useState } from 'react';
import { Plus, Workflow, MoreHorizontal, Play, Pause, Copy, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useAutomationFlows, 
  useCreateFlow, 
  useToggleFlowActive, 
  useDeleteFlow, 
  useDuplicateFlow,
  type AutomationFlow 
} from '@/hooks/useAutomationFlows';

interface FlowsListProps {
  onSelectFlow: (flow: AutomationFlow) => void;
}

const triggerLabels: Record<string, string> = {
  new_lead: 'Nuevo Lead',
  payment_failed: 'Pago Fallido',
  trial_expiring: 'Prueba por vencer',
  tag_added: 'Etiqueta agregada',
  manual: 'Manual',
};

export function FlowsList({ onSelectFlow }: FlowsListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState('manual');

  const { data: flows, isLoading } = useAutomationFlows();
  const createFlow = useCreateFlow();
  const toggleActive = useToggleFlowActive();
  const deleteFlow = useDeleteFlow();
  const duplicateFlow = useDuplicateFlow();

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) return;
    
    const result = await createFlow.mutateAsync({
      name: newFlowName,
      trigger_type: newFlowTrigger,
    });
    
    setCreateDialogOpen(false);
    setNewFlowName('');
    setNewFlowTrigger('manual');
    onSelectFlow(result);
  };

  const handleToggleActive = (flow: AutomationFlow, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleActive.mutate({ id: flow.id, is_active: !flow.is_active });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de eliminar este flujo?')) {
      deleteFlow.mutate(id);
    }
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateFlow.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-display">AUTOMATIZACIONES</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea flujos automáticos para mensajes y acciones
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Flujo
        </Button>
      </div>

      {flows && flows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Workflow className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sin automatizaciones</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Crea tu primer flujo para automatizar mensajes cuando ocurran eventos como pagos fallidos o nuevos leads.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Flujo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flows?.map((flow) => (
            <Card 
              key={flow.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSelectFlow(flow)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{flow.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Trigger: {triggerLabels[flow.trigger_type] || flow.trigger_type}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={flow.is_active ? "default" : "secondary"} className="text-xs">
                      {flow.is_active ? 'Activo' : flow.is_draft ? 'Borrador' : 'Inactivo'}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelectFlow(flow); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleToggleActive(flow, e)}>
                          {flow.is_active ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Desactivar
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Activar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleDuplicate(flow.id, e)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive" 
                          onClick={(e) => handleDelete(flow.id, e)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-lg font-bold">{flow.total_executions}</p>
                    <p className="text-xs text-muted-foreground">Ejecuciones</p>
                  </div>
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-lg font-bold text-emerald-400">
                      {flow.total_executions > 0 
                        ? Math.round((flow.successful_executions / flow.total_executions) * 100) 
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Éxito</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Flujo de Automatización</DialogTitle>
            <DialogDescription>
              Crea un flujo que se ejecute automáticamente cuando ocurra un evento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del Flujo</Label>
              <Input
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder="Ej: Recuperación de pagos fallidos"
              />
            </div>
            <div className="space-y-2">
              <Label>Evento disparador</Label>
              <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_lead">Nuevo Lead</SelectItem>
                  <SelectItem value="payment_failed">Pago Fallido</SelectItem>
                  <SelectItem value="trial_expiring">Prueba por vencer</SelectItem>
                  <SelectItem value="tag_added">Etiqueta agregada</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateFlow} disabled={!newFlowName.trim() || createFlow.isPending}>
              Crear Flujo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
