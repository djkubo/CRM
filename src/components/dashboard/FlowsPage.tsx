import { Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function FlowsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="rounded-2xl bg-primary/10 p-6 mb-6">
        <Workflow className="h-12 w-12 text-primary" />
      </div>
      <h1 className="text-2xl font-display font-semibold text-foreground mb-2">
        Automatizaciones
      </h1>
      <p className="text-muted-foreground max-w-md mb-6">
        Próximamente podrás crear flujos automáticos para enviar mensajes,
        segmentar clientes y recuperar ingresos — todo sin intervención manual.
      </p>
      <Button
        variant="outline"
        onClick={() => navigate(-1)}
        className="gap-2"
      >
        ← Volver
      </Button>
    </div>
  );
}
