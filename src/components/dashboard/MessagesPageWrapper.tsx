import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Bot } from "lucide-react";
import MessagesPage from "./MessagesPage";
import BotChatPage from "./BotChatPage";

export default function MessagesPageWrapper() {
  const [activeTab, setActiveTab] = useState<"crm" | "bot">("bot");

  return (
    <div className="h-full flex flex-col">
      {/* Tab switcher */}
      <div className="px-4 pt-4 pb-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "crm" | "bot")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="bot" className="gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Chat Bot IA</span>
              <span className="sm:hidden">Bot</span>
            </TabsTrigger>
            <TabsTrigger value="crm" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">CRM Mensajes</span>
              <span className="sm:hidden">CRM</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "bot" ? <BotChatPage /> : <MessagesPage />}
      </div>
    </div>
  );
}
