import { useState } from 'react';
import { FlowsList } from '@/components/flows/FlowsList';
import { FlowBuilder } from '@/components/flows/FlowBuilder';
import type { AutomationFlow } from '@/hooks/useAutomationFlows';

export default function FlowsPage() {
  const [selectedFlow, setSelectedFlow] = useState<AutomationFlow | null>(null);

  if (selectedFlow) {
    return (
      <div className="h-[calc(100vh-8rem)] min-h-[680px] overflow-hidden rounded-xl border border-border/50 bg-card">
        <FlowBuilder
          flow={selectedFlow}
          onBack={() => setSelectedFlow(null)}
        />
      </div>
    );
  }

  return <FlowsList onSelectFlow={setSelectedFlow} />;
}
