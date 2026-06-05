import { useState, useEffect } from "react";
import { useMobileView } from "./useMobileView";

export type InboxView = "list" | "chat";

export function useInboxNavigation(initialActiveId: string = "") {
  const isMobile = useMobileView();
  const [currentView, setCurrentView] = useState<InboxView>("list");
  const [selectedConversationId, setSelectedConversationId] = useState<string>(initialActiveId);

  // Sync initialActiveId if it changes and is active
  useEffect(() => {
    if (initialActiveId) {
      setSelectedConversationId(initialActiveId);
      if (isMobile) {
        setCurrentView("chat");
      }
    }
  }, [initialActiveId, isMobile]);

  const selectConversation = (id: string) => {
    setSelectedConversationId(id);
    if (isMobile) {
      setCurrentView("chat");
    }
  };

  const goBack = () => {
    if (isMobile) {
      setCurrentView("list");
      setSelectedConversationId("");
    }
  };

  return {
    currentView: isMobile ? currentView : "chat",
    selectedConversationId,
    selectConversation,
    goBack,
    isMobile,
  };
}
