import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageNodeData {
  channel?: 'whatsapp' | 'sms' | 'email';
  templateId?: string;
  customMessage?: string;
  variables?: string[];
}

const channelIcons = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
};

const channelLabels = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

function MessageNode({ data, selected }: NodeProps) {
  const nodeData = data as MessageNodeData;
  const channel = nodeData.channel || 'whatsapp';
  const Icon = channelIcons[channel] || MessageSquare;
  const label = channelLabels[channel] || 'Mensaje';

  const messagePreview = nodeData.customMessage 
    ? nodeData.customMessage.slice(0, 50) + (nodeData.customMessage.length > 50 ? '...' : '')
    : 'Sin mensaje configurado';

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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
          <Icon className="h-4 w-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Enviar</p>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
      </div>
      
      <div className="mt-2 rounded-md bg-secondary/50 p-2">
        <p className="text-xs text-muted-foreground line-clamp-2">{messagePreview}</p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default memo(MessageNode);
