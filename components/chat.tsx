'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { motion } from 'framer-motion';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { ExtendedAttachment } from '@/types';

import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate('/api/history');
    },
    onError: (error) => {
      console.error('Chat error occurred:', error);
      
      // Handle specific error types with more user-friendly messages
      let errorMessage = 'An error occurred, please try again!';
      
      if (error instanceof Error) {
        if (error.message.includes('document') || error.message.includes('file')) {
          errorMessage = 'There was an issue processing your file. Please try uploading a smaller or different file.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'The request timed out. Please try with a simpler query or smaller file.';
        } else if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = 'Network connection issue. Please check your internet connection and try again.';
        } else if (error.message.includes('model') || error.message.includes('Model')) {
          errorMessage = 'There was an issue with the selected AI model. Please try selecting a different model from the dropdown.';
        } else if (error.message.includes('rate limit') || error.message.includes('capacity')) {
          errorMessage = 'The AI service is currently experiencing high demand. Please try again in a few moments.';
        }
      }
      
      toast.error(errorMessage, {
        description: 'You can try again or start a new conversation.',
        action: {
          label: 'Retry',
          onClick: () => reload(),
        },
      });
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<ExtendedAttachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // Initialize animation variables when component mounts
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--animation-play-state', 'running');
    root.style.setProperty('--animation-opacity', '1');
    root.style.setProperty('--nebula-opacity', '0.9');
    root.style.setProperty('--stars-opacity', '0.9');
    root.style.setProperty('--shooting-stars-display', 'block');
    root.style.setProperty('--body-before-opacity', '1');
    root.style.setProperty('--body-after-opacity', '1');
    
    // Generate random stars directly in the component
    generateRandomStars();
    
    // Make the function globally accessible for the animation toggle
    // @ts-ignore - Adding to window
    window.generateRandomStars = generateRandomStars;
    
    // Cleanup function
    return () => {
      // @ts-ignore - Remove from window
      delete window.generateRandomStars;
    };
  }, []);
  
  // Function to generate random stars
  const generateRandomStars = () => {
    // Clear any existing random stars first
    const existingStars = document.querySelector('.cosmic-animation-container .random-stars');
    if (existingStars) {
      existingStars.innerHTML = '';
    }
    
    // Generate a unique seed for this session
    let sessionSeed = Math.floor(Math.random() * 1000000);
    console.log('Generating random stars with seed:', sessionSeed);
    
    // Simple random function with seed
    function seededRandom() {
      const x = Math.sin(sessionSeed++) * 10000;
      return x - Math.floor(x);
    }
    
    // Get the random stars container
    const randomStarsContainer = document.querySelector('.cosmic-animation-container .random-stars');
    if (!randomStarsContainer) {
      console.error('Random stars container not found');
      return;
    }
    
    // Dense cluster region (40-60 stars) - reduced from 50-80
    const clusterStarCount = 40 + Math.floor(seededRandom() * 20);
    const clusterCenterX = 20 + seededRandom() * 60; // 20-80% of screen width
    const clusterCenterY = 20 + seededRandom() * 60; // 20-80% of screen height
    
    for (let i = 0; i < clusterStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star';
      
      // Position within cluster (less concentrated distribution)
      const angle = seededRandom() * Math.PI * 2;
      // Increased spread from 30 to 45 to make clusters less dense
      const distance = seededRandom() * 45; 
      const top = clusterCenterY + Math.sin(angle) * distance;
      const left = clusterCenterX + Math.cos(angle) * distance;
      
      // Random size (0.5px - 3px)
      const size = 0.5 + seededRandom() * 2.5;
      
      // Random brightness
      const brightness = 0.5 + seededRandom() * 0.5;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 3 + seededRandom() * 4;
      
      // Apply styles
      star.style.top = `${top}%`;
      star.style.left = `${left}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = `${delay}s`;
      star.style.animationDuration = `${duration}s`;
      
      randomStarsContainer.appendChild(star);
    }
    
    // Scattered stars throughout (50-70 stars) - increased from 40-60
    const scatteredStarCount = 50 + Math.floor(seededRandom() * 20);
    
    for (let i = 0; i < scatteredStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star';
      
      // Random position across entire screen
      const top = seededRandom() * 100;
      const left = seededRandom() * 100;
      
      // Random size (0.5px - 2px)
      const size = 0.5 + seededRandom() * 1.5;
      
      // Random brightness
      const brightness = 0.4 + seededRandom() * 0.6;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 3 + seededRandom() * 4;
      
      // Apply styles
      star.style.top = `${top}%`;
      star.style.left = `${left}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = `${delay}s`;
      star.style.animationDuration = `${duration}s`;
      
      randomStarsContainer.appendChild(star);
    }
    
    // Bright highlight stars (5-8 stars) - reduced from 10-15
    const brightStarCount = 5 + Math.floor(seededRandom() * 3);
    
    for (let i = 0; i < brightStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star bright';
      
      // Random position across entire screen
      const top = seededRandom() * 100;
      const left = seededRandom() * 100;
      
      // Larger size (2px - 4px)
      const size = 2 + seededRandom() * 2;
      
      // High brightness
      const brightness = 0.8 + seededRandom() * 0.2;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 4 + seededRandom() * 3;
      
      // Apply styles
      star.style.top = `${top}%`;
      star.style.left = `${left}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = `${delay}s`;
      star.style.animationDuration = `${duration}s`;
      star.style.boxShadow = `0 0 ${Math.floor(size)}px ${Math.floor(size/2)}px rgba(255, 255, 255, 0.6)`;
      
      randomStarsContainer.appendChild(star);
    }
    
    console.log(`Generated ${clusterStarCount + scatteredStarCount + brightStarCount} random stars`);
  };

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background relative">
        {/* Full-page animation background */}
        <div className="messages-background">
          {/* Consolidated animation container */}
          <div className="cosmic-animation-container">
            {/* Random stars will be generated by JavaScript */}
            <div className="random-stars"></div>
            
            {/* Aurora effects */}
            <div className="aurora">
              <div className="light"></div>
              <div className="light light-2"></div>
              <div className="light light-3"></div>
            </div>
            
            {/* Shooting stars - enhanced with more stars */}
            <div className="shooting-star">
              <div className="star-1"></div>
              <div className="star-2"></div>
              <div className="star-3"></div>
            </div>
            
            {/* Cosmic dust particles */}
            <div className="cosmic-dust"></div>
            
            {/* Pulsating stars */}
            <div className="pulsating-stars">
              <div className="star star-1"></div>
              <div className="star star-2"></div>
              <div className="star star-3"></div>
              <div className="star star-4"></div>
              <div className="star star-5"></div>
              <div className="star star-6"></div>
            </div>
            
            {/* Parallax stars */}
            <div className="parallax-stars">
              <div className="layer layer-1"></div>
              <div className="layer layer-2"></div>
              <div className="layer layer-3"></div>
            </div>
          </div>
        </div>

        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <motion.div 
          className="relative mx-auto px-4 pb-4 md:pb-6 w-full md:max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 -z-10 pointer-events-none" />
          
          <div className="flex gap-2 w-full">
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                input={input}
                setInput={setInput}
                handleSubmit={handleSubmit}
                isLoading={isLoading}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                messages={messages}
                setMessages={setMessages}
                append={append}
              />
            )}
          </div>
        </motion.div>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
