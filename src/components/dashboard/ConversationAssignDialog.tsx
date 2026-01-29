import { useState } from "react";
import { useAgents, useAssignConversation, useCurrentAgent, type Agent, type Conversation } from "@/hooks/useAgents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Circle, Search, User, UserMinus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ConversationAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
}

const statusColors = {
  online: "bg-green-500",
  away: "bg-yellow-500",
  offline: "bg-zinc-500",
};

export function ConversationAssignDialog({
  open,
  onOpenChange,
  conversation,
}: ConversationAssignDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: agents, isLoading } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const assignConversation = useAssignConversation();
  const { toast } = useToast();

  const filteredAgents = agents?.filter((agent) => {
    const query = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.email?.toLowerCase().includes(query)
    );
  });

  // Sort: online first, then away, then offline
  const sortedAgents = [...(filteredAgents || [])].sort((a, b) => {
    const order = { online: 0, away: 1, offline: 2 };
    return order[a.status] - order[b.status];
  });

  const handleAssign = async (agent: Agent | null) => {
    if (!conversation) return;

    try {
      await assignConversation.mutateAsync({
        conversationId: conversation.id,
        agentId: agent?.id || null,
        assignedBy: currentAgent?.id,
      });

      toast({
        title: agent ? "Conversación asignada" : "Asignación removida",
        description: agent
          ? `Asignada a ${agent.name}`
          : "La conversación ya no tiene agente asignado",
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo asignar la conversación",
        variant: "destructive",
      });
    }
  };

  const handleTakeConversation = () => {
    if (currentAgent) {
      handleAssign(currentAgent);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar conversación</DialogTitle>
          <DialogDescription>
            Selecciona un agente para atender esta conversación
          </DialogDescription>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex gap-2">
          {currentAgent && conversation?.assigned_agent_id !== currentAgent.id && (
            <Button
              variant="default"
              size="sm"
              onClick={handleTakeConversation}
              disabled={assignConversation.isPending}
              className="flex-1"
            >
              <User className="h-4 w-4 mr-2" />
              Tomar yo
            </Button>
          )}
          {conversation?.assigned_agent_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAssign(null)}
              disabled={assignConversation.isPending}
              className="flex-1"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Quitar asignación
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar agente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Agent list */}
        <ScrollArea className="h-64">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedAgents?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <User className="h-8 w-8 mb-2" />
              <p className="text-sm">No se encontraron agentes</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedAgents?.map((agent) => {
                const isAssigned = conversation?.assigned_agent_id === agent.id;
                const isAvailable = agent.current_chats < agent.max_chats;
                const isOnline = agent.status !== "offline";

                return (
                  <button
                    key={agent.id}
                    onClick={() => handleAssign(agent)}
                    disabled={!isOnline || assignConversation.isPending}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                      "hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed",
                      isAssigned && "bg-primary/10 ring-1 ring-primary/20"
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {agent.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                        statusColors[agent.status]
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{agent.name}</span>
                        {isAssigned && (
                          <Badge variant="secondary" className="h-5 text-xs">
                            Asignado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{agent.current_chats}/{agent.max_chats} chats</span>
                        {!isAvailable && (
                          <Badge variant="outline" className="h-4 text-[10px] text-yellow-600 border-yellow-300">
                            Lleno
                          </Badge>
                        )}
                      </div>
                    </div>

                    {assignConversation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
