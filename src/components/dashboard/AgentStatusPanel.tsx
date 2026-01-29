import { useAgents, useCurrentAgent, useUpdateAgentStatus, type Agent } from "@/hooks/useAgents";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Users, Circle, ChevronDown, Headphones, Coffee, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const statusConfig = {
  online: {
    label: "En línea",
    color: "bg-green-500",
    textColor: "text-green-600",
    icon: Circle,
  },
  away: {
    label: "Ausente",
    color: "bg-yellow-500",
    textColor: "text-yellow-600",
    icon: Coffee,
  },
  offline: {
    label: "Desconectado",
    color: "bg-zinc-500",
    textColor: "text-zinc-500",
    icon: LogOut,
  },
};

function AgentBadge({ agent, size = "sm" }: { agent: Agent; size?: "sm" | "md" }) {
  const config = statusConfig[agent.status];
  const sizeClasses = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <Avatar className={sizeClasses}>
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {agent.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background",
            dotSize,
            config.color
          )} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">{agent.name}</p>
        <p className="text-xs text-muted-foreground">
          {config.label} • {agent.current_chats}/{agent.max_chats} chats
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function AgentStatusPanel() {
  const { data: agents, isLoading } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const updateStatus = useUpdateAgentStatus();

  const onlineAgents = agents?.filter(a => a.status === "online") || [];
  const awayAgents = agents?.filter(a => a.status === "away") || [];

  const handleStatusChange = (status: "online" | "away" | "offline") => {
    if (currentAgent) {
      updateStatus.mutate({ agentId: currentAgent.id, status });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-4 w-4 animate-pulse bg-muted rounded" />
        <span className="text-sm text-muted-foreground">Cargando agentes...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border/50">
        {/* Current agent status selector */}
        {currentAgent && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-8">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  statusConfig[currentAgent.status].color
                )} />
                <span className="text-xs">
                  {statusConfig[currentAgent.status].label}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Mi estado</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleStatusChange("online")}>
                <Circle className="h-3 w-3 mr-2 fill-green-500 text-green-500" />
                En línea
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("away")}>
                <Coffee className="h-3 w-3 mr-2 text-yellow-500" />
                Ausente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("offline")}>
                <LogOut className="h-3 w-3 mr-2 text-zinc-500" />
                Desconectado
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Separator */}
        <div className="h-4 w-px bg-border" />

        {/* Team online status */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="text-xs">
                  {onlineAgents.length + awayAgents.length}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{onlineAgents.length} en línea, {awayAgents.length} ausente</p>
            </TooltipContent>
          </Tooltip>

          {/* Agent avatars */}
          <div className="flex -space-x-1.5">
            {[...onlineAgents, ...awayAgents].slice(0, 5).map((agent) => (
              <AgentBadge key={agent.id} agent={agent} size="sm" />
            ))}
            {(onlineAgents.length + awayAgents.length) > 5 && (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground border-2 border-background">
                +{onlineAgents.length + awayAgents.length - 5}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Compact version for header
export function AgentStatusCompact() {
  const { data: agents } = useAgents();
  const onlineCount = agents?.filter(a => a.status !== "offline").length || 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Headphones className="h-4 w-4" />
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {onlineCount}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{onlineCount} agentes disponibles</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
