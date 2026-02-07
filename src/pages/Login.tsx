import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import vrpLogo from "@/assets/vrp-logo.png";
import { Eye, EyeOff, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { buildInfo } from "@/lib/buildInfo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const emailSchema = z.string().email("Email inválido");
const passwordSchema = z.string().min(6, "La contraseña debe tener al menos 6 caracteres");

// Security: Admin validation is handled server-side via app_admins table and is_admin() function
// Client-side checks were removed to prevent credential exposure

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const loginState = useMemo(() => {
    const raw = location.state as unknown;
    if (!raw || typeof raw !== "object") return null;
    const state = raw as { from?: unknown; reason?: unknown };
    const from = typeof state.from === "string" ? state.from : undefined;
    const reason = typeof state.reason === "string" ? state.reason : undefined;
    return { from, reason };
  }, [location.state]);

  useEffect(() => {
    // Remembered email for faster logins (never store password).
    try {
      const last = localStorage.getItem("vrp:lastEmail");
      if (last && typeof last === "string") {
        setEmail(last);
        setRememberEmail(true);
      }
    } catch {
      // Ignore storage errors (some browsers/private modes).
    }
  }, []);

  const handleRefreshApp = async () => {
    try {
      // Lightweight: ask the service worker to check for updates, then reload.
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update().catch(() => {});
      }
    } finally {
      window.location.reload();
    }
  };

  const handleRepairCache = async () => {
    try {
      // Best-effort: remove stale PWA/service worker caches that can pin old builds.
      // NOTE: This does NOT clear localStorage (so your session can remain).
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } finally {
      window.location.reload();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    // Validate inputs
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        setFormError(validationError.errors[0].message);
        setIsLoading(false);
        return;
      }
    }

    // Authentication is handled server-side by Supabase Auth
    // Authorization is enforced by RLS policies using is_admin() function
    try {
      const result = await signIn(email, password);
      if (result.error) {
        if (result.error.message.includes("Invalid login")) {
          setFormError("Email o contraseña incorrectos.");
        } else {
          throw result.error;
        }
      } else {
        try {
          if (rememberEmail) localStorage.setItem("vrp:lastEmail", email.trim());
          else localStorage.removeItem("vrp:lastEmail");
        } catch {
          // Ignore storage errors.
        }

        toast({
          title: "Sesión iniciada",
          description: "Listo. Cargando tu centro de comando.",
        });
        navigate(loginState?.from || "/");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Ocurrió un error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border shadow-elevated">
        <CardHeader className="text-center pb-2">
          {/* VRP Logo */}
          <div className="flex justify-center mb-6">
            <img src={vrpLogo} alt="VRP System" className="h-12 object-contain" />
          </div>
          
          <CardTitle className="font-display text-2xl tracking-wide text-foreground">
            Centro de Comando
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Inicia sesión para continuar.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-6">
          {loginState?.reason === "auth_required" && (
            <Alert className="mb-4 border-border/60 bg-muted/20">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Sesión requerida</AlertTitle>
              <AlertDescription>
                Tu sesión no estaba activa. Inicia sesión para volver a entrar.
              </AlertDescription>
            </Alert>
          )}

          {formError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  disabled={isLoading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                <Checkbox
                  checked={rememberEmail}
                  onCheckedChange={(v) => setRememberEmail(Boolean(v))}
                  disabled={isLoading}
                />
                Recordar mi email
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRefreshApp()}
                disabled={isLoading}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Actualizar app
              </Button>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-11 font-medium" 
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Accediendo...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Iniciar Sesión
                </span>
              )}
            </Button>
          </form>

          <Accordion type="single" collapsible className="mt-5">
            <AccordionItem value="help" className="border-border/50">
              <AccordionTrigger className="py-3 text-sm text-muted-foreground hover:text-foreground">
                ¿Problemas para cargar?
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-xs text-muted-foreground">
                <p>
                  Si ves pantallas viejas o la app se queda atorada, normalmente es cache del navegador/PWA.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full">
                      Reparar caché (no borra tu sesión)
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reparar caché</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esto des-registra el Service Worker y limpia el caché de la app para forzar la versión más nueva.
                        <br />
                        <br />
                        No borra tu sesión, pero sí puede tardar unos segundos en recargar.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleRepairCache()} className="bg-primary hover:bg-primary/90">
                        Reparar y recargar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          
          {/* Footer branding */}
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              VRP Operaciones de Ingresos
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground font-mono">
              Build {buildInfo.gitSha} · {new Date(buildInfo.buildTime).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
