import { useState } from 'react';
import { FlowsList } from '@/components/flows/FlowsList';
import { FlowBuilder } from '@/components/flows/FlowBuilder';
import { useAutomationFlow, type AutomationFlow } from '@/hooks/useAutomationFlows';

export function FlowsPage() {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { data: selectedFlow } = useAutomationFlow(selectedFlowId);

  const handleSelectFlow = (flow: AutomationFlow) => {
    setSelectedFlowId(flow.id);
  };

  const handleBack = () => {
    setSelectedFlowId(null);
  };

  if (selectedFlowId && selectedFlow) {
    return (
      <div className="h-[calc(100vh-4rem)] md:h-screen">
        <FlowBuilder flow={selectedFlow} onBack={handleBack} />
      </div>
    );
  }

  return <FlowsList onSelectFlow={handleSelectFlow} />;
}
