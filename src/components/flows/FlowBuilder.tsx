import { useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import MessageNode from './nodes/MessageNode';
import DelayNode from './nodes/DelayNode';
import ConditionNode from './nodes/ConditionNode';
import TagNode from './nodes/TagNode';
import WebhookNode from './nodes/WebhookNode';
import EndNode from './nodes/EndNode';
import { NodesSidebar } from './NodesSidebar';
import { NodeEditor } from './NodeEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Play, Pause, Loader2 } from 'lucide-react';
import { useUpdateFlow, useToggleFlowActive, type AutomationFlow } from '@/hooks/useAutomationFlows';
import type { Json } from '@/integrations/supabase/types';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  delay: DelayNode,
  condition: ConditionNode,
  tag: TagNode,
  webhook: WebhookNode,
  end: EndNode,
};

interface FlowBuilderProps {
  flow: AutomationFlow;
  onBack: () => void;
}

const defaultTriggerNode: Node = {
  id: 'trigger-1',
  type: 'trigger',
  position: { x: 250, y: 50 },
  data: { type: 'manual' },
};

export function FlowBuilder({ flow, onBack }: FlowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(flow.name);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  
  // Parse nodes and edges from JSON
  const initialNodes = (flow.nodes_json as unknown as Node[]) || [defaultTriggerNode];
  const initialEdges = (flow.edges_json as unknown as Edge[]) || [];
  
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes.length > 0 ? initialNodes : [defaultTriggerNode]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const updateFlow = useUpdateFlow();
  const toggleActive = useToggleFlowActive();

  // Auto-save debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const saveFlow = useCallback(() => {
    updateFlow.mutate({
      id: flow.id,
      name,
      nodes_json: nodes as unknown as Json,
      edges_json: edges as unknown as Json,
    });
  }, [flow.id, name, nodes, edges, updateFlow]);

  // Auto-save on changes
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveFlow();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, name]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 },
      animated: true,
    }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left - 90,
        y: event.clientY - rect.top - 25,
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: getDefaultNodeData(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
  }, [setNodes]);

  const handleToggleActive = () => {
    toggleActive.mutate({ id: flow.id, is_active: !flow.is_active });
  };

  return (
    <div className="flex h-full">
      <NodesSidebar onDragStart={onDragStart} />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-sidebar">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64 bg-secondary border-transparent focus:border-border"
            />
            {updateFlow.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={saveFlow}
              disabled={updateFlow.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              Guardar
            </Button>
            <Button
              variant={flow.is_active ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleActive}
              disabled={toggleActive.isPending}
            >
              {flow.is_active ? (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Desactivar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Activar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 },
              animated: true,
            }}
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1}
              color="hsl(var(--muted-foreground) / 0.2)"
            />
            <Controls className="!bg-card !border-border !rounded-md" />
            <MiniMap 
              className="!bg-card !border-border !rounded-md"
              nodeColor={(node) => {
                switch (node.type) {
                  case 'trigger': return 'hsl(142 71% 45%)';
                  case 'message': return 'hsl(217 91% 60%)';
                  case 'delay': return 'hsl(43 96% 56%)';
                  case 'condition': return 'hsl(263 70% 50%)';
                  case 'tag': return 'hsl(142 71% 45%)';
                  case 'webhook': return 'hsl(186 91% 50%)';
                  case 'end': return 'hsl(var(--primary))';
                  default: return 'hsl(var(--muted-foreground))';
                }
              }}
            />
          </ReactFlow>
        </div>
      </div>

      {selectedNode && (
        <NodeEditor
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdate={handleNodeUpdate}
        />
      )}
    </div>
  );
}

function getDefaultNodeData(type: string): Record<string, unknown> {
  switch (type) {
    case 'trigger':
      return { type: 'manual' };
    case 'message':
      return { channel: 'whatsapp', customMessage: '' };
    case 'delay':
      return { duration: 1, unit: 'hours' };
    case 'condition':
      return { field: 'lifecycle_stage', operator: 'equals', value: '' };
    case 'tag':
      return { action: 'add', tagName: '' };
    case 'webhook':
      return { method: 'POST', url: '' };
    case 'end':
      return {};
    default:
      return {};
  }
}
