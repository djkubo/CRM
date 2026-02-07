import { useEffect, useRef } from "react";
import { registerSW } from "virtual:pwa-register";
import { toast } from "@/components/ui/sonner";

export function PwaUpdater() {
  const shownNeedRefresh = useRef(false);
  const shownOfflineReady = useRef(false);

  useEffect(() => {
    let updateCheckInterval: number | undefined;

    const updateSW = registerSW({
      immediate: true,
      onRegistered(registration) {
        if (!registration) return;
        // Proactively check for updates (helps when users keep tabs open for hours).
        registration.update().catch(() => {});
        updateCheckInterval = window.setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      },
      onNeedRefresh() {
        if (shownNeedRefresh.current) return;
        shownNeedRefresh.current = true;

        toast("Nueva versión disponible", {
          description: "Actualiza para aplicar mejoras y correcciones.",
          action: {
            label: "Actualizar ahora",
            onClick: () => void updateSW(true),
          },
          cancel: {
            label: "Luego",
          },
          duration: Infinity,
        });
      },
      onOfflineReady() {
        if (shownOfflineReady.current) return;
        shownOfflineReady.current = true;

        toast("Modo sin conexión listo", {
          description: "La app quedó cacheada en tu dispositivo.",
          duration: 4000,
        });
      },
      onRegisterError(error) {
        console.error("[PWA] Error registrando Service Worker", error);
      },
    });

    return () => {
      if (updateCheckInterval) window.clearInterval(updateCheckInterval);
    };
  }, []);

  return null;
}

