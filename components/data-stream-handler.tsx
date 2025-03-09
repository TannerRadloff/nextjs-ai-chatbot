'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'message'
    | 'error'
    | 'text'
    | 'reasoning';
  content: string | Suggestion;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream, setMessages } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);
  const reasoningRef = useRef('');
  const currentMessageIdRef = useRef<string | null>(null);
  const textContentRef = useRef('');

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      // Handle reasoning type for o1 model responses
      if (delta.type === 'reasoning' && typeof delta.content === 'string') {
        reasoningRef.current += delta.content;
      }

      // Handle text-delta type for o1 model responses
      if (delta.type === 'text-delta' && typeof delta.content === 'string') {
        textContentRef.current += delta.content;
        
        // Update the messages array with the accumulated text
        if (currentMessageIdRef.current) {
          setMessages((prevMessages) => {
            return prevMessages.map(msg => {
              if (msg.id === currentMessageIdRef.current) {
                return {
                  ...msg,
                  content: textContentRef.current
                };
              }
              return msg;
            });
          });
        }
      }

      // Handle message type for o1 model responses
      if (delta.type === 'message' && typeof delta.content === 'string') {
        try {
          const message = JSON.parse(delta.content);
          if (message && message.role === 'assistant') {
            // Reset text content for new message
            if (currentMessageIdRef.current !== message.id) {
              textContentRef.current = '';
            }
            
            currentMessageIdRef.current = message.id;
            
            // Add reasoning if we've collected any
            if (reasoningRef.current.length > 0) {
              message.reasoning = reasoningRef.current;
              // Reset reasoning for next message
              reasoningRef.current = '';
            }
            
            setMessages((prevMessages) => {
              // Check if the message already exists
              const exists = prevMessages.some(m => m.id === message.id);
              if (exists) return prevMessages;
              
              // Add the new message
              return [...prevMessages, message];
            });
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact, setMessages]);

  return null;
}
