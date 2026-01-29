import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DelayNodeData {
  duration?: number;
  unit?: 'minutes' | 'hours' | 'days';
}

const unitLabels = {
  minutes: 'minutos',
  hours: 'horas',
  days: 'días',
};

function DelayNode({ data, selected }: NodeProps) {
  const nodeData = data as DelayNodeData;
  const duration = nodeData.duration || 1;
  const unit = nodeData.unit || 'hours';
  const unitLabel = unitLabels[unit] || unit;

  return (
    <div
      className={cn(
        "min-w-[160px] rounded-lg border bg-card p-3 shadow-md transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
      
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
          <Clock className="h-4 w-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Esperar</p>
          <p className="text-sm font-semibold text-foreground">
            {duration} {unitLabel}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default memo(DelayNode);
