import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-elevated text-center space-y-3">
        <div className="text-display text-5xl text-foreground">404</div>
        <h1 className="text-lg font-semibold text-foreground">Ruta no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La ruta <code className="font-mono text-foreground">{location.pathname}</code> no existe.
        </p>
        <div className="pt-2 flex items-center justify-center gap-2">
          <Button asChild className="touch-feedback">
            <Link to="/">Volver al inicio</Link>
          </Button>
          <Button asChild variant="outline" className="touch-feedback">
            <Link to="/login">Ir a login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
