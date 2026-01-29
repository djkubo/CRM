import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        "min-w-[120px] rounded-lg border bg-card p-3 shadow-md transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
      
      <div className="flex items-center gap-2 justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <CircleCheck className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Fin</p>
        </div>
      </div>
    </div>
  );
}

export default memo(EndNode);
