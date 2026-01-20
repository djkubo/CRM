import { useState } from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  AlertTriangle,
  FileText,
  Users, 
  CreditCard,
  Upload,
  BarChart3, 
  Settings,
  LogOut,
  Send,
  MessageSquare,
  Shield,
  Menu,
  X
} from "lucide-react";

interface SidebarProps {
  activeItem?: string;
  onItemClick?: (item: string) => void;
}

const menuItems = [
  { id: "dashboard", label: "Command Center", icon: LayoutDashboard },
  { id: "messages", label: "Mensajes", icon: MessageSquare },
  { id: "recovery", label: "Recovery", icon: AlertTriangle },
  { id: "invoices", label: "Facturas", icon: FileText },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "subscriptions", label: "Suscripciones", icon: CreditCard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "import", label: "Importar/Sync", icon: Upload },
  { id: "diagnostics", label: "Diagnostics", icon: Shield },
  { id: "campaigns", label: "Campañas", icon: Send },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ activeItem = "dashboard", onItemClick }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleItemClick = (itemId: string) => {
    onItemClick?.(itemId);
    setIsOpen(false); // Close on mobile after selection
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 md:hidden glass-header safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">S</span>
            </div>
            <span className="text-base font-semibold text-foreground">SaaS Admin</span>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg hover:bg-accent touch-feedback"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-background border-r border-sidebar-border transition-transform duration-300 ease-in-out",
          // Mobile: slide in/out
          "md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo - Hidden on mobile (shown in header) */}
        <div className="hidden md:flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow-primary">
            <span className="text-lg font-bold text-primary-foreground">S</span>
          </div>
          <span className="text-lg font-semibold text-sidebar-foreground">SaaS Admin</span>
        </div>

        {/* Mobile safe area spacer */}
        <div className="h-14 md:hidden safe-area-top" />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium transition-all duration-200 touch-feedback",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-4 safe-area-bottom">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent">
              <span className="text-sm font-medium text-sidebar-foreground">AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Admin User</p>
              <p className="text-xs text-muted-foreground truncate">admin@saas.com</p>
            </div>
            <button className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors touch-feedback">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
