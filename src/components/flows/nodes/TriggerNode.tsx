import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap, UserPlus, CreditCard, Clock, Tag, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TriggerNodeData {
  type?: 'new_lead' | 'payment_failed' | 'trial_expiring' | 'tag_added' | 'manual';
  config?: {
    tagName?: string;
    daysBeforeExpiry?: number;
  };
}

const triggerIcons = {
  new_lead: UserPlus,
  payment_failed: CreditCard,
  trial_expiring: Clock,
  tag_added: Tag,
  manual: Play,
};

const triggerLabels = {
  new_lead: 'Nuevo Lead',
  payment_failed: 'Pago Fallido',
  trial_expiring: 'Trial Expirando',
  tag_added: 'Tag Agregado',
  manual: 'Manual',
};

function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as TriggerNodeData;
  const triggerType = nodeData.type || 'manual';
  const Icon = triggerIcons[triggerType] || Zap;
  const label = triggerLabels[triggerType] || 'Trigger';

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-md transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
          <Icon className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Inicio</p>
          <p className="text-sm font-semibold text-foreground truncate">{label}</p>
        </div>
      </div>
      
      {nodeData.config?.tagName && (
        <div className="mt-2 text-xs text-muted-foreground">
          Tag: <span className="text-foreground">{nodeData.config.tagName}</span>
        </div>
      )}
      
      {nodeData.config?.daysBeforeExpiry && (
        <div className="mt-2 text-xs text-muted-foreground">
          {nodeData.config.daysBeforeExpiry} días antes
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default memo(TriggerNode);
