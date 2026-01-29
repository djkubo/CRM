import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Inbox, User, Users, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversationFilter = "all" | "mine" | "unassigned";
export type ConversationStatusFilter = "all" | "open" | "pending" | "resolved";

interface ConversationFiltersProps {
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  statusFilter: ConversationStatusFilter;
  onStatusFilterChange: (status: ConversationStatusFilter) => void;
  counts?: {
    all: number;
    mine: number;
    unassigned: number;
  };
}

const filterConfig = {
  all: { label: "Todos", icon: Inbox },
  mine: { label: "Mis chats", icon: User },
  unassigned: { label: "Sin asignar", icon: Users },
};

const statusConfig = {
  all: { label: "Todos", icon: Inbox },
  open: { label: "Abiertos", icon: AlertCircle },
  pending: { label: "Pendientes", icon: Clock },
  resolved: { label: "Resueltos", icon: CheckCircle },
};

export function ConversationFilters({
  filter,
  onFilterChange,
  statusFilter,
  onStatusFilterChange,
  counts,
}: ConversationFiltersProps) {
  return (
    <div className="flex flex-col gap-2 p-3 border-b">
      {/* Agent filter tabs */}
      <div className="flex gap-1">
        {(Object.keys(filterConfig) as ConversationFilter[]).map((key) => {
          const config = filterConfig[key];
          const Icon = config.icon;
          const count = counts?.[key] ?? 0;
          const isActive = filter === key;

          return (
            <Button
              key={key}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onFilterChange(key)}
              className={cn(
                "flex-1 gap-1.5 h-8 text-xs",
                isActive && "bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
              {count > 0 && (
                <Badge 
                  variant={isActive ? "default" : "secondary"} 
                  className="h-4 min-w-4 px-1 text-[10px]"
                >
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Status filter dropdown */}
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as ConversationStatusFilter)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(statusConfig) as ConversationStatusFilter[]).map((key) => {
            const config = statusConfig[key];
            const Icon = config.icon;
            return (
              <SelectItem key={key} value={key} className="text-xs">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
