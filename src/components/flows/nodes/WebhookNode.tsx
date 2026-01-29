import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Globe, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookNodeData {
  url?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

function WebhookNode({ data, selected }: NodeProps) {
  const nodeData = data as WebhookNodeData;
  const method = nodeData.method || 'POST';
  const url = nodeData.url || 'Sin URL configurada';
  
  // Extract domain from URL for display
  let displayUrl = url;
  try {
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      displayUrl = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
    }
  } catch {
    displayUrl = url.slice(0, 30);
  }

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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/10">
          <Globe className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Webhook</p>
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-xs font-mono px-1 rounded",
              method === 'GET' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            )}>
              {method}
            </span>
          </div>
        </div>
      </div>
      
      <div className="mt-2 flex items-center gap-1 rounded-md bg-secondary/50 p-2">
        <ArrowUpRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground truncate">{displayUrl}</p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default memo(WebhookNode);
