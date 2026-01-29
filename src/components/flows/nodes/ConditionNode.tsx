import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConditionNodeData {
  field?: 'lifecycle_stage' | 'total_spend' | 'has_tag' | 'last_payment_status';
  operator?: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value?: string | number;
}

const fieldLabels: Record<string, string> = {
  lifecycle_stage: 'Etapa',
  total_spend: 'Total gastado',
  has_tag: 'Tiene tag',
  last_payment_status: 'Estado pago',
};

const operatorLabels: Record<string, string> = {
  equals: '=',
  not_equals: '≠',
  greater_than: '>',
  less_than: '<',
  contains: 'contiene',
};

function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as ConditionNodeData;
  const field = nodeData.field || 'lifecycle_stage';
  const operator = nodeData.operator || 'equals';
  const value = nodeData.value ?? '';

  const conditionText = `${fieldLabels[field] || field} ${operatorLabels[operator] || operator} "${value}"`;

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-md transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
      
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10">
          <GitBranch className="h-4 w-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Condición</p>
          <p className="text-sm font-semibold text-foreground">If / Else</p>
        </div>
      </div>
      
      <div className="mt-2 rounded-md bg-secondary/50 p-2">
        <p className="text-xs text-muted-foreground truncate">{conditionText}</p>
      </div>

      <div className="mt-3 flex justify-between text-xs">
        <span className="text-emerald-400">✓ Sí</span>
        <span className="text-red-400">✗ No</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!h-3 !w-3 !border-2 !border-background !bg-red-500"
        style={{ left: '70%' }}
      />
    </div>
  );
}

export default memo(ConditionNode);
