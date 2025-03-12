'use client';

import { type Message } from 'ai';
import { useState, useEffect } from 'react';

import { Chat } from '@/components/chat';
import { AgentInterface } from '@/components/agent-interface';
import { useAgentMode } from '@/hooks/use-agent-mode';
import { type VisibilityType } from '@/components/visibility-selector';

type AgentModeSwitcherProps = {
  id: string
  selectedChatModel: string
  selectedVisibilityType: VisibilityType
  isReadonly: boolean
};

export function AgentModeSwitcher({
  id,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: AgentModeSwitcherProps) {
  const { agentMode } = useAgentMode();
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  
  // This would typically be used to load any existing messages from an API
  useEffect(() => {
    // For now, we're just setting empty initial messages
    setInitialMessages([]);
  }, []);

  if (agentMode) {
    return <AgentInterface />;
  }

  return (
    <Chat
      key={id}
      id={id}
      initialMessages={initialMessages}
      selectedChatModel={selectedChatModel}
      selectedVisibilityType={selectedVisibilityType}
      isReadonly={isReadonly}
    />
  );
} 