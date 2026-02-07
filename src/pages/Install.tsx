import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Share, Plus, CheckCircle2, Smartphone, ArrowDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches || 
                       (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Listen for beforeinstallprompt (Android/Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Check if app was installed
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-top safe-area-bottom">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">¡Ya tienes la app!</CardTitle>
            <CardDescription>
              VRP Centro de Comando está instalada y lista para usar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full touch-feedback">
              Ir al panel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-top safe-area-bottom">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">¡Instalación completa!</CardTitle>
            <CardDescription>
              Ahora puedes encontrar la app en tu pantalla de inicio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full touch-feedback">
              Continuar en el navegador
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-top safe-area-bottom">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-20 h-20 rounded-2xl overflow-hidden shadow-lg">
            <img src="/pwa-512x512.png" alt="App Icon" className="w-full h-full object-cover" />
          </div>
          <CardTitle className="text-2xl">Instalar VRP Centro de Comando</CardTitle>
          <CardDescription>
            Instala la app en tu dispositivo para acceso rápido y experiencia nativa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isIOS ? (
            // iOS Installation Instructions
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 p-4 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  Instrucciones para iPhone/iPad
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        Toca el botón <Share className="inline w-4 h-4 mx-1" /> <strong>Compartir</strong> en la barra de Safari
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        Desliza hacia abajo y toca <Plus className="inline w-4 h-4 mx-1" /> <strong>Agregar a Inicio</strong>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        Toca <strong>Agregar</strong> en la esquina superior derecha
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-6 h-6 text-muted-foreground animate-bounce" />
              </div>
              
              <p className="text-center text-sm text-muted-foreground">
                El botón de compartir está en la barra inferior de Safari
              </p>
            </div>
          ) : deferredPrompt ? (
            // Android/Chrome with install prompt available
            <Button onClick={handleInstallClick} className="w-full touch-feedback" size="lg">
              <Download className="w-5 h-5 mr-2" />
              Instalar App
            </Button>
          ) : (
            // Fallback for browsers without install prompt
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 p-4 space-y-3">
                <h3 className="font-medium">Para instalar:</h3>
                <p className="text-sm text-muted-foreground">
                  Abre el menú de tu navegador (⋮ o ⋯) y busca la opción "Instalar app" o "Agregar a pantalla de inicio"
                </p>
              </div>
            </div>
          )}

          <Button 
            variant="outline" 
            onClick={() => navigate("/")} 
            className="w-full touch-feedback"
          >
            Continuar en el navegador
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
