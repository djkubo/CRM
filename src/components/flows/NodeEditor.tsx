import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Node } from '@xyflow/react';

interface NodeEditorProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

export function NodeEditor({ node, onClose, onUpdate }: NodeEditorProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setFormData(node.data as Record<string, unknown>);
    }
  }, [node]);

  if (!node) return null;

  const handleChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onUpdate(node.id, newData);
  };

  const renderTriggerEditor = () => (
    <div className="space-y-4">
      <div>
        <Label>Tipo de Trigger</Label>
        <Select
          value={(formData.type as string) || 'manual'}
          onValueChange={(v) => handleChange('type', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new_lead">Nuevo Lead</SelectItem>
            <SelectItem value="payment_failed">Pago Fallido</SelectItem>
            <SelectItem value="trial_expiring">Trial Expirando</SelectItem>
            <SelectItem value="tag_added">Tag Agregado</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {formData.type === 'tag_added' && (
        <div>
          <Label>Nombre del Tag</Label>
          <Input
            value={(formData.config as Record<string, string>)?.tagName || ''}
            onChange={(e) => handleChange('config', { ...formData.config as object, tagName: e.target.value })}
            placeholder="Ej: vip_customer"
          />
        </div>
      )}
      
      {formData.type === 'trial_expiring' && (
        <div>
          <Label>Días antes de expirar</Label>
          <Input
            type="number"
            value={(formData.config as Record<string, number>)?.daysBeforeExpiry || 3}
            onChange={(e) => handleChange('config', { ...formData.config as object, daysBeforeExpiry: parseInt(e.target.value) })}
          />
        </div>
      )}
    </div>
  );

  const renderMessageEditor = () => (
    <div className="space-y-4">
      <div>
        <Label>Canal</Label>
        <Select
          value={(formData.channel as string) || 'whatsapp'}
          onValueChange={(v) => handleChange('channel', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Mensaje</Label>
        <Textarea
          value={(formData.customMessage as string) || ''}
          onChange={(e) => handleChange('customMessage', e.target.value)}
          placeholder="Escribe tu mensaje aquí...&#10;&#10;Variables: {{name}}, {{email}}, {{amount}}"
          rows={4}
        />
      </div>
      
      <div className="p-2 rounded-md bg-secondary/50 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Variables disponibles:</p>
        <code className="text-primary">{'{{name}}'}</code>, 
        <code className="text-primary ml-1">{'{{email}}'}</code>, 
        <code className="text-primary ml-1">{'{{phone}}'}</code>, 
        <code className="text-primary ml-1">{'{{amount}}'}</code>
      </div>
    </div>
  );

  const renderDelayEditor = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Duración</Label>
          <Input
            type="number"
            min={1}
            value={(formData.duration as number) || 1}
            onChange={(e) => handleChange('duration', parseInt(e.target.value))}
          />
        </div>
        <div>
          <Label>Unidad</Label>
          <Select
            value={(formData.unit as string) || 'hours'}
            onValueChange={(v) => handleChange('unit', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
              <SelectItem value="days">Días</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderConditionEditor = () => (
    <div className="space-y-4">
      <div>
        <Label>Campo</Label>
        <Select
          value={(formData.field as string) || 'lifecycle_stage'}
          onValueChange={(v) => handleChange('field', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lifecycle_stage">Etapa del Cliente</SelectItem>
            <SelectItem value="total_spend">Total Gastado</SelectItem>
            <SelectItem value="has_tag">Tiene Tag</SelectItem>
            <SelectItem value="last_payment_status">Estado del Pago</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Operador</Label>
        <Select
          value={(formData.operator as string) || 'equals'}
          onValueChange={(v) => handleChange('operator', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Es igual a</SelectItem>
            <SelectItem value="not_equals">No es igual a</SelectItem>
            <SelectItem value="greater_than">Mayor que</SelectItem>
            <SelectItem value="less_than">Menor que</SelectItem>
            <SelectItem value="contains">Contiene</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Valor</Label>
        <Input
          value={(formData.value as string) || ''}
          onChange={(e) => handleChange('value', e.target.value)}
          placeholder="Ej: CUSTOMER, 100, vip"
        />
      </div>
    </div>
  );

  const renderTagEditor = () => (
    <div className="space-y-4">
      <div>
        <Label>Acción</Label>
        <Select
          value={(formData.action as string) || 'add'}
          onValueChange={(v) => handleChange('action', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Agregar Tag</SelectItem>
            <SelectItem value="remove">Quitar Tag</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Nombre del Tag</Label>
        <Input
          value={(formData.tagName as string) || ''}
          onChange={(e) => handleChange('tagName', e.target.value)}
          placeholder="Ej: contacted, vip_customer"
        />
      </div>
    </div>
  );

  const renderWebhookEditor = () => (
    <div className="space-y-4">
      <div>
        <Label>Método</Label>
        <Select
          value={(formData.method as string) || 'POST'}
          onValueChange={(v) => handleChange('method', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>URL</Label>
        <Input
          value={(formData.url as string) || ''}
          onChange={(e) => handleChange('url', e.target.value)}
          placeholder="https://api.example.com/webhook"
        />
      </div>
      
      <div>
        <Label>Body (JSON)</Label>
        <Textarea
          value={(formData.body as string) || ''}
          onChange={(e) => handleChange('body', e.target.value)}
          placeholder='{"client_id": "{{client_id}}", "event": "flow_triggered"}'
          rows={3}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );

  const nodeEditors: Record<string, () => JSX.Element> = {
    trigger: renderTriggerEditor,
    message: renderMessageEditor,
    delay: renderDelayEditor,
    condition: renderConditionEditor,
    tag: renderTagEditor,
    webhook: renderWebhookEditor,
  };

  const renderEditor = nodeEditors[node.type];

  return (
    <div className="w-72 border-l border-border bg-sidebar p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Configurar Nodo</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-4 p-2 rounded-md bg-secondary/50">
        <p className="text-xs text-muted-foreground">Tipo</p>
        <p className="text-sm font-medium capitalize">{node.type}</p>
      </div>

      {renderEditor ? renderEditor() : (
        <p className="text-sm text-muted-foreground">
          Este nodo no tiene opciones configurables.
        </p>
      )}
    </div>
  );
}
