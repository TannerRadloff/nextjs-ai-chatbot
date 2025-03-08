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
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

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
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error('Failed to upload file, please try again!');
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
        });

        if (artifactResponse.ok) {
          const artifactData = await artifactResponse.json();
          
          // Only add the document artifact to the chat
          if (artifactData.documentId) {
            await append({
              id: generateUUID(),
              role: 'system',
              content: '',
              documentId: artifactData.documentId,
              artifactTitle: artifactData.title,
              artifactKind: 'text',
            } as MessageWithDocument);
          }
        } else {
          console.error('Failed to create text artifact');
        }
      } catch (error) {
        console.error('Error creating text artifact:', error);
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
      
      // Process any text file attachments first
      const remainingAttachments = await processTextFiles([...attachments]);
      
      // Then handle the submission with remaining attachments
      handleSubmit(event, {
        ...chatRequestOptions,
        experimental_attachments: remainingAttachments,
      });
      
      // Clear attachments after submission
      setAttachments([]);
      setLocalStorageInput('');
      resetHeight();
    },
    [handleSubmit, attachments, setAttachments, uploadQueue, chatId, append, setLocalStorageInput, resetHeight]
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
