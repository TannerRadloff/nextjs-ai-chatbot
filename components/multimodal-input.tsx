'use client';

import type {
  ChatRequestOptions,
  CreateMessage,
  Message,
} from 'ai';
import { ExtendedAttachment } from '@/types';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { sanitizeUIMessages, generateUUID } from '@/lib/utils';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CrossIcon } from './icons';

// Add an interface at the top of the file
interface MessageWithDocument extends Message {
  documentId?: string;
  artifactTitle?: string;
  artifactKind?: string;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
}: {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<ExtendedAttachment>;
  setAttachments: Dispatch<SetStateAction<Array<ExtendedAttachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Check file size before uploading
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File ${file.name} is too large (max 10MB)`);
        return null;
      }

      // Add timeout to fetch to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType, textContent } = data;

        // Simply return the file data for attachment
        // We'll process it further when the user submits
        return {
          url,
          name: pathname,
          contentType: contentType,
          ...(textContent && { textContent }),
        };
      }
      
      // Handle response errors
      if (response.status === 413) {
        toast.error(`File ${file.name} is too large for the server to process`);
      } else {
        try {
          const { error } = await response.json();
          toast.error(error || `Failed to upload ${file.name}`);
        } catch (jsonError) {
          toast.error(`Failed to upload ${file.name}: ${response.statusText}`);
        }
      }
      return null;
    } catch (error) {
      console.error('File upload error:', error);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          toast.error(`File upload for ${file.name} timed out. Please try a smaller file.`);
        } else {
          toast.error(`Failed to upload ${file.name}: ${error.message}`);
        }
      } else {
        toast.error(`Failed to upload ${file.name}, please try again!`);
      }
      return null;
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined && attachment !== null,
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error('Error uploading files!', error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );
  
  // New function to process text files as artifacts
  const processTextFiles = async (attachmentsToProcess: ExtendedAttachment[]) => {
    const textFileAttachments = attachmentsToProcess.filter(
      attachment => attachment.contentType === 'text/plain' && attachment.textContent
    );
    
    const otherAttachments = attachmentsToProcess.filter(
      attachment => attachment.contentType !== 'text/plain' || !attachment.textContent
    );
    
    // Process text files to create artifacts
    for (const textAttachment of textFileAttachments) {
      try {
        console.log('Creating text artifact for:', textAttachment.name);
        
        // Check if the text content is too large
        const MAX_TEXT_SIZE = 1000000; // 1MB
        if (textAttachment.textContent && textAttachment.textContent.length > MAX_TEXT_SIZE) {
          console.warn(`Text content too large: ${textAttachment.textContent.length} characters`);
          toast.error(`File ${textAttachment.name} is too large to process (max 1MB of text)`);
          continue;
        }
        
        // Add timeout to avoid hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const artifactResponse = await fetch('/api/text-artifact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            fileUrl: textAttachment.url,
            fileName: textAttachment.name,
            textContent: textAttachment.textContent,
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (artifactResponse.ok) {
          const artifactData = await artifactResponse.json();
          console.log('Text artifact created:', artifactData);
          
          // Only add the document artifact to the chat
          if (artifactData.documentId) {
            // Create the message with the document
            const documentMessage: MessageWithDocument = {
              id: generateUUID(),
              role: 'system',
              content: '',
              createdAt: new Date(),
              documentId: artifactData.documentId,
              artifactTitle: artifactData.title,
              artifactKind: 'text',
            };
            
            // Add the document message to the local message state
            setMessages(currentMessages => [...currentMessages, documentMessage]);
            
            // Make a direct API call to create the chat with just the artifact
            try {
              const chatResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  id: chatId,
                  messages: [documentMessage],
                  selectedChatModel: 'chat-model-small', // Default model
                }),
              });
              
              if (chatResponse.ok) {
                // Add a user message that displays the artifact
                const toolInvocation = {
                  toolName: 'createDocument',
                  toolCallId: generateUUID(),
                  state: 'result' as const,
                  args: {
                    title: artifactData.title,
                  },
                  result: {
                    id: artifactData.documentId,
                    kind: 'text',
                    title: artifactData.title,
                  }
                };

                // Create an assistant message to display the artifact
                const assistantMessage: Message = {
                  id: generateUUID(),
                  role: 'assistant',
                  content: `I've created a document "${artifactData.title}" from your uploaded text file.`,
                  createdAt: new Date(),
                  toolInvocations: [toolInvocation],
                };

                // Add the assistant message to show the artifact in the UI
                setMessages(currentMessages => [...currentMessages, assistantMessage]);
                toast.success(`Created document from ${textAttachment.name}`);
              } else {
                const errorText = await chatResponse.text();
                console.error('Failed to register document with chat API:', errorText);
                toast.error(`Document created but couldn't be added to the chat.`);
              }
            } catch (chatError) {
              console.error('Error in chat API call:', chatError);
              toast.error(`Document created but couldn't be added to the chat.`);
            }
          }
        } else {
          // Handle specific response errors
          try {
            const errorData = await artifactResponse.json();
            console.error('Failed to create text artifact, response:', errorData);
            toast.error(errorData.error || `Failed to create document from ${textAttachment.name}`);
          } catch (jsonError) {
            console.error('Error parsing error response:', jsonError, 'Status:', artifactResponse.status);
            toast.error(`Failed to create document from ${textAttachment.name}: ${artifactResponse.statusText}`);
          }
        }
      } catch (error) {
        console.error('Error creating text artifact:', error);
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            toast.error(`Processing ${textAttachment.name} timed out. Please try a smaller file.`);
          } else {
            toast.error(`Error processing ${textAttachment.name}: ${error.message}`);
          }
        } else {
          toast.error(`Error creating document from ${textAttachment.name}`);
        }
      }
    }
    
    return otherAttachments;
  };
  
  // Wrap the original handleSubmit to process text files first
  const wrappedHandleSubmit = useCallback(
    async (event?: { preventDefault?: () => void }, chatRequestOptions?: ChatRequestOptions) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      
      if (uploadQueue.length > 0) {
        toast.info('Please wait for all files to upload');
        return;
      }
      
      // If there is no input and no attachments, don't submit
      if (!input.trim() && attachments.length === 0) {
        return;
      }
      
      // Track if we processed any text files
      let processedTextFiles = false;
      
      // Process any text file attachments first
      if (attachments.length > 0) {
        const initialAttachmentCount = attachments.length;
        const remainingAttachments = await processTextFiles([...attachments]);
        processedTextFiles = remainingAttachments.length < initialAttachmentCount;
      }
      
      // Only proceed with regular submission if there's input text or non-text file attachments
      if (input.trim() || (attachments.length > 0 && !processedTextFiles)) {
        // Then handle the submission with remaining attachments
        handleSubmit(event, {
          ...chatRequestOptions,
          experimental_attachments: attachments.filter(
            attachment => attachment.contentType !== 'text/plain' || !attachment.textContent
          ),
        });
      }
      
      // Clear attachments after submission
      setAttachments([]);
      setLocalStorageInput('');
      resetHeight();
      
      if (width && width > 768) {
        textareaRef.current?.focus();
      }
    },
    [handleSubmit, attachments, setAttachments, uploadQueue, chatId, processTextFiles, input, setLocalStorageInput, resetHeight, width]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn('relative w-full max-w-screen-lg', className)}
    >
      {/* Attachment preview section */}
      <AnimatePresence>
        {attachments.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="w-full"
          >
            <div className="flex flex-row flex-wrap gap-2 rounded-xl border border-border/50 bg-secondary/20 p-2 mb-2">
              {attachments.map((file) => (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={file.url}
                  className="flex max-w-full flex-row items-center gap-2 rounded-lg border border-border/50 bg-primary/5 py-1 pl-3 pr-1 text-sm"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-md"
                    onClick={() => {
                      setAttachments((currentFiles) =>
                        currentFiles.filter(
                          (currentFile) => currentFile.url !== file.url,
                        ),
                      );
                    }}
                  >
                    <CrossIcon size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          wrappedHandleSubmit(e); // Use our wrapped version
        }}
        className="flex w-full flex-row items-end gap-2 p-2"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="image/*,application/pdf,text/plain"
        />
        
        <AttachmentsButton
          fileInputRef={fileInputRef}
          isLoading={isLoading || uploadQueue.length > 0}
        />

        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                wrappedHandleSubmit(); // Use our wrapped version
              }
            }}
            placeholder="Message..."
            className="min-h-[40px] w-full resize-none overflow-hidden rounded-xl pr-12 py-3 focus-visible:ring-primary/70 focus-visible:border-primary/50 focus-visible:shadow-[0_0_10px_rgba(0,150,255,0.3)] bg-background/40"
            value={input}
            onChange={handleInput}
            disabled={isLoading || uploadQueue.length > 0}
          />

          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-row items-center">
            {isLoading ? (
              <StopButton stop={stop} setMessages={setMessages} />
            ) : (
              <SendButton
                submitForm={wrappedHandleSubmit} // Use our wrapped version
                input={input}
                uploadQueue={uploadQueue}
              />
            )}
          </div>
        </div>
      </form>
    </motion.div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);

function PureAttachmentsButton({
  fileInputRef,
  isLoading,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  isLoading: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-10 shrink-0 rounded-xl border-border/40 bg-background/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50 hover:shadow-[0_0_10px_rgba(0,150,255,0.3)]"
      onClick={() => fileInputRef.current?.click()}
      disabled={isLoading}
    >
      <PaperclipIcon />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="absolute bottom-1 right-1 size-8 rounded-xl hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        stop();
        setMessages((messages) => sanitizeUIMessages(messages));
      }}
    >
      <StopIcon />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="absolute bottom-1 right-1 size-8 rounded-xl hover:bg-primary/10 hover:text-primary"
      disabled={!input.trim() && uploadQueue.length === 0}
      onClick={submitForm}
    >
      <ArrowUpIcon />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});
