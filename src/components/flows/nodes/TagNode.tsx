import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Tag, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagNodeData {
  action?: 'add' | 'remove';
  tagName?: string;
}

function TagNode({ data, selected }: NodeProps) {
  const nodeData = data as TagNodeData;
  const action = nodeData.action || 'add';
  const tagName = nodeData.tagName || 'Sin tag';

  const ActionIcon = action === 'add' ? Plus : Minus;
  const actionLabel = action === 'add' ? 'Agregar' : 'Quitar';
  const actionColor = action === 'add' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10';

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
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", actionColor)}>
          <Tag className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{actionLabel} Tag</p>
          <p className="text-sm font-semibold text-foreground truncate">{tagName}</p>
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

export default memo(TagNode);
