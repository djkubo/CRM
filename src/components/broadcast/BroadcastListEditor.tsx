import React, { useEffect, useState, useCallback } from 'react';
import { X, Search, UserPlus, UserMinus, Tag, Filter, Loader2, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  useBroadcastList,
  useBroadcastListMembers,
  useCreateBroadcastList,
  useUpdateBroadcastList,
  useAddMembersToList,
  useRemoveMemberFromList,
} from '@/hooks/useBroadcastLists';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toast } from 'sonner';

interface BroadcastListEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string | null;
}

interface DynamicFilter {
  lifecycle_stage?: string;
  tags?: string[];
  has_phone?: boolean;
  min_spend?: number;
}

const LIFECYCLE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'LEAD', label: 'Leads' },
  { value: 'TRIAL', label: 'Trials' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'CHURN', label: 'Churn' },
];

export function BroadcastListEditor({ open, onOpenChange, listId }: BroadcastListEditorProps) {
  const queryClient = useQueryClient();
  const { data: list } = useBroadcastList(listId);
  const { data: members } = useBroadcastListMembers(listId);
  const createMutation = useCreateBroadcastList();
  const updateMutation = useUpdateBroadcastList();
  const addMembersMutation = useAddMembersToList();
  const removeMemberMutation = useRemoveMemberFromList();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  
  // Dynamic filter state
  const [listType, setListType] = useState<'static' | 'dynamic'>('static');
  const [dynamicFilter, setDynamicFilter] = useState<DynamicFilter>({
    has_phone: true,
  });

  // Debounced search for async lookup
  const debouncedSearch = useDebouncedValue(search, 300);

  // Async search: only fetch when user types (debounced)
  const { data: clients, isLoading: isSearching } = useQuery({
    queryKey: ['clients-broadcast-search', debouncedSearch, tagFilter],
    queryFn: async () => {
      // Require at least 2 chars or a tag filter to search
      if (!debouncedSearch && !tagFilter) return [];
      
      let query = supabase
        .from('clients')
        .select('id, full_name, email, phone, phone_e164, tags, lifecycle_stage, total_spend')
        .not('phone_e164', 'is', null)
        .order('total_spend', { ascending: false, nullsFirst: false })
        .limit(50);

      if (debouncedSearch && debouncedSearch.length >= 2) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
      }

      if (tagFilter) {
        query = query.contains('tags', [tagFilter]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: open && (debouncedSearch.length >= 2 || !!tagFilter),
  });

  // Count preview for dynamic filter
  const { data: dynamicCount, isLoading: isCountingDynamic } = useQuery({
    queryKey: ['broadcast-dynamic-count', dynamicFilter],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true });

      // Always require phone for broadcast
      if (dynamicFilter.has_phone !== false) {
        query = query.not('phone_e164', 'is', null);
      }

      if (dynamicFilter.lifecycle_stage) {
        query = query.eq('lifecycle_stage', dynamicFilter.lifecycle_stage);
      }

      if (dynamicFilter.tags && dynamicFilter.tags.length > 0) {
        query = query.contains('tags', dynamicFilter.tags);
      }

      if (dynamicFilter.min_spend && dynamicFilter.min_spend > 0) {
        query = query.gte('total_spend', dynamicFilter.min_spend * 100); // Convert to cents
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: open && listType === 'dynamic',
  });

  // Fetch unique tags
  const { data: allTags } = useQuery({
    queryKey: ['all-client-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('tags')
        .not('tags', 'is', null)
        .limit(1000);
      
      if (error) throw error;
      
      const tagSet = new Set<string>();
      data?.forEach((client) => {
        if (client.tags) {
          client.tags.forEach((tag: string) => tagSet.add(tag));
        }
      });
      return Array.from(tagSet).sort();
    },
    enabled: open,
  });

  // Current member IDs for filtering
  const memberClientIds = new Set(members?.map((m) => m.client_id) || []);

  useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description || '');
      // Restore list type from DB
      const savedType = (list as any).filter_type || 'static';
      setListType(savedType);
      if (savedType === 'dynamic' && (list as any).filter_criteria) {
        setDynamicFilter((list as any).filter_criteria);
      }
    } else {
      setName('');
      setDescription('');
      setListType('static');
      setDynamicFilter({ has_phone: true });
    }
    setSelectedClients([]);
    setSearch('');
  }, [list, open]);

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      if (listId) {
        // Update existing list
        const updateData: any = { id: listId, name, description };
        if (listType === 'dynamic') {
          updateData.filter_type = 'dynamic';
          updateData.filter_criteria = dynamicFilter;
        } else {
          updateData.filter_type = 'static';
          updateData.filter_criteria = null;
        }
        await updateMutation.mutateAsync(updateData);
      } else {
        // Create new list
        const createData: any = { name, description };
        if (listType === 'dynamic') {
          createData.filter_type = 'dynamic';
          createData.filter_criteria = dynamicFilter;
        }
        const newList = await createMutation.mutateAsync(createData);
        
        // If static and clients selected, add them
        if (listType === 'static' && selectedClients.length > 0 && newList?.id) {
          await addMembersMutation.mutateAsync({ listId: newList.id, clientIds: selectedClients });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['broadcast-lists'] });
      toast.success(listId ? 'Lista actualizada' : 'Lista creada');
      onOpenChange(false);
    } catch (err) {
      toast.error('Error al guardar la lista');
    }
  };

  const handleAddSelected = async () => {
    if (!listId || selectedClients.length === 0) return;
    await addMembersMutation.mutateAsync({ listId, clientIds: selectedClients });
    setSelectedClients([]);
  };

  const handleRemoveMember = async (clientId: string) => {
    if (!listId) return;
    await removeMemberMutation.mutateAsync({ listId, clientId });
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    );
  };

  const availableClients = clients?.filter((c) => !memberClientIds.has(c.id)) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>{listId ? 'Editar Lista' : 'Nueva Lista de Difusión'}</SheetTitle>
          <SheetDescription>
            {listId ? 'Modifica los detalles y miembros de la lista' : 'Crea una nueva lista para enviar mensajes masivos'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la lista</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Clientes VIP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe el propósito de esta lista..."
                rows={2}
              />
            </div>
          </div>

          {/* List Type Selector */}
          <Tabs value={listType} onValueChange={(v) => setListType(v as 'static' | 'dynamic')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="static" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="dynamic" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Dinámica
              </TabsTrigger>
            </TabsList>

            {/* Static: Manual member selection */}
            <TabsContent value="static" className="flex-1 overflow-hidden flex flex-col gap-3 mt-3">
              {listId && (
                <>
                  {/* Current Members */}
                  <div className="space-y-2">
                    <Label>Miembros actuales ({members?.length || 0})</Label>
                    <ScrollArea className="h-28 border rounded-md p-2">
                      {members && members.length > 0 ? (
                        <div className="space-y-1">
                          {members.map((member: any) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {member.client?.full_name || 'Sin nombre'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.client?.phone_e164 || member.client?.phone}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveMember(member.client_id)}
                              >
                                <UserMinus className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay miembros en esta lista
                        </p>
                      )}
                    </ScrollArea>
                  </div>
                </>
              )}

              {/* Add Members - Async Search */}
              <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
                <Label>Buscar y agregar miembros</Label>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Escribe al menos 2 caracteres..."
                      className="pl-9"
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger className="w-36">
                      <Tag className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      {allTags?.map((tag) => (
                        <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <ScrollArea className="flex-1 border rounded-md p-2 min-h-[120px]">
                  {availableClients.length > 0 ? (
                    <div className="space-y-1">
                      {availableClients.map((client) => (
                        <div
                          key={client.id}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                          onClick={() => toggleClientSelection(client.id)}
                        >
                          <Checkbox
                            checked={selectedClients.includes(client.id)}
                            onCheckedChange={() => toggleClientSelection(client.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {client.full_name || 'Sin nombre'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {client.phone_e164 || client.phone} • {client.email || 'Sin email'}
                            </p>
                          </div>
                          {client.tags && client.tags.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {client.tags[0]}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {isSearching ? 'Buscando...' : 
                       debouncedSearch.length < 2 && !tagFilter ? 
                         'Escribe al menos 2 caracteres o selecciona un tag' : 
                         'No se encontraron contactos'}
                    </p>
                  )}
                </ScrollArea>

                {selectedClients.length > 0 && listId && (
                  <Button onClick={handleAddSelected} disabled={addMembersMutation.isPending}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Agregar {selectedClients.length} seleccionados
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Dynamic: Filter-based selection */}
            <TabsContent value="dynamic" className="flex-1 overflow-hidden flex flex-col gap-4 mt-3">
              <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Configurar Filtros</Label>
                  <Badge variant="outline" className="text-sm">
                    {isCountingDynamic ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Users className="h-3 w-3 mr-1" />
                    )}
                    {dynamicCount?.toLocaleString() || 0} contactos
                  </Badge>
                </div>

                <p className="text-sm text-muted-foreground">
                  Los miembros se calcularán automáticamente en cada envío según estos filtros.
                </p>

                {/* Lifecycle Stage */}
                <div className="space-y-2">
                  <Label>Etapa del Ciclo de Vida</Label>
                  <Select 
                    value={dynamicFilter.lifecycle_stage || ''} 
                    onValueChange={(v) => setDynamicFilter(prev => ({ ...prev, lifecycle_stage: v || undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFECYCLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <Label>Tags (opcional)</Label>
                  <Select 
                    value={dynamicFilter.tags?.[0] || ''} 
                    onValueChange={(v) => setDynamicFilter(prev => ({ 
                      ...prev, 
                      tags: v ? [v] : undefined 
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin filtro</SelectItem>
                      {allTags?.map((tag) => (
                        <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Min Spend */}
                <div className="space-y-2">
                  <Label>Gasto mínimo (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Ej: 100 = clientes con $100+ de LTV"
                    value={dynamicFilter.min_spend || ''}
                    onChange={(e) => setDynamicFilter(prev => ({ 
                      ...prev, 
                      min_spend: e.target.value ? Number(e.target.value) : undefined 
                    }))}
                  />
                </div>

                {/* Has Phone */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="has_phone"
                    checked={dynamicFilter.has_phone !== false}
                    onCheckedChange={(checked) => setDynamicFilter(prev => ({ 
                      ...prev, 
                      has_phone: checked as boolean 
                    }))}
                  />
                  <Label htmlFor="has_phone" className="text-sm cursor-pointer">
                    Solo contactos con teléfono (requerido para WhatsApp/SMS)
                  </Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
          >
            {listId ? 'Guardar Cambios' : 'Crear Lista'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}