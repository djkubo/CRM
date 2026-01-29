import { Zap, MessageSquare, Clock, GitBranch, Tag, Globe, CircleCheck } from 'lucide-react';

interface NodesSidebarProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

const nodeCategories = [
  {
    title: 'Triggers',
    nodes: [
      { type: 'trigger', label: 'Inicio', icon: Zap, color: 'bg-emerald-500/10 text-emerald-400' },
    ],
  },
  {
    title: 'Acciones',
    nodes: [
      { type: 'message', label: 'Mensaje', icon: MessageSquare, color: 'bg-blue-500/10 text-blue-400' },
      { type: 'delay', label: 'Esperar', icon: Clock, color: 'bg-amber-500/10 text-amber-400' },
      { type: 'tag', label: 'Tag', icon: Tag, color: 'bg-emerald-500/10 text-emerald-400' },
      { type: 'webhook', label: 'Webhook', icon: Globe, color: 'bg-cyan-500/10 text-cyan-400' },
    ],
  },
  {
    title: 'Lógica',
    nodes: [
      { type: 'condition', label: 'Condición', icon: GitBranch, color: 'bg-purple-500/10 text-purple-400' },
      { type: 'end', label: 'Fin', icon: CircleCheck, color: 'bg-primary/10 text-primary' },
    ],
  },
];

export function NodesSidebar({ onDragStart }: NodesSidebarProps) {
  return (
    <div className="w-56 border-r border-border bg-sidebar p-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Nodos
      </h3>
      
      {nodeCategories.map((category) => (
        <div key={category.title} className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2">{category.title}</p>
          <div className="space-y-2">
            {category.nodes.map((node) => {
              const Icon = node.icon;
              return (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type)}
                  className="flex items-center gap-2 p-2 rounded-md border border-border bg-card cursor-grab active:cursor-grabbing hover:bg-accent transition-colors"
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${node.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium">{node.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      <div className="mt-6 p-3 rounded-md bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">
          💡 Arrastra los nodos al canvas para construir tu automatización
        </p>
      </div>
    </div>
  );
}
