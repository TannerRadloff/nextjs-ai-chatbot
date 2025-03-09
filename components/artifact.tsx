import type {
  Attachment,
  ChatRequestOptions,
  CreateMessage,
  Message,
} from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from './ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { imageArtifact } from '@/artifacts/image/client';
import { codeArtifact } from '@/artifacts/code/client';
import { sheetArtifact } from '@/artifacts/sheet/client';
import { textArtifact } from '@/artifacts/text/client';
import equal from 'fast-deep-equal';
import { ExtendedAttachment } from '@/types';
import { toast } from 'sonner';

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]['kind'];

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

function PureArtifact({
  chatId,
  input,
  setInput,
  handleSubmit,
  isLoading,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
}: {
  chatId: string;
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<ExtendedAttachment>;
  setAttachments: Dispatch<SetStateAction<Array<ExtendedAttachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  votes: Array<Vote> | undefined;
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
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) {
  // Utility function to handle API response errors
  const handleApiError = useCallback(async (response: Response, defaultMessage: string) => {
    if (!response.ok) {
      let errorMessage = defaultMessage;
      
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If we can't parse the JSON, use the status text or default message
        errorMessage = response.statusText || defaultMessage;
      }
      
      // Handle specific status codes
      switch (response.status) {
        case 400:
          toast.error(`Invalid request: ${errorMessage}`);
          break;
        case 401:
          toast.error(`Authentication required: ${errorMessage}`);
          break;
        case 403:
          toast.error(`Permission denied: ${errorMessage}`);
          break;
        case 404:
          toast.error(`Document not found: ${errorMessage}`);
          break;
        case 413:
          toast.error(`Content too large: ${errorMessage}`);
          break;
        case 429:
          toast.error(`Rate limit exceeded: ${errorMessage}`);
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          toast.error(`Server error: ${errorMessage}`);
          break;
        default:
          toast.error(`Error: ${errorMessage}`);
      }
      
      return false;
    }
    
    return true;
  }, []);

  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' && artifact.status !== 'streaming'
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher,
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  const { open: isSidebarOpen } = useSidebar();

  useEffect(() => {
    if (documents && documents.length > 0) {
      try {
        const mostRecentDocument = documents.at(-1);

        if (mostRecentDocument) {
          setDocument(mostRecentDocument);
          setCurrentVersionIndex(documents.length - 1);
          setArtifact((currentArtifact) => ({
            ...currentArtifact,
            content: mostRecentDocument.content ?? '',
          }));
        } else {
          toast.error('Could not find the most recent document version');
        }
      } catch (error: unknown) {
        console.error('Error setting document from documents:', error);
        toast.error(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (documents && documents.length === 0) {
      toast.error('No document versions found');
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    async (updatedContent: string) => {
      if (!artifact) return;

      try {
        mutate<Array<Document>>(
          `/api/document?id=${artifact.documentId}`,
          async (currentDocuments) => {
            if (!currentDocuments) {
              toast.error('Failed to retrieve document data');
              return undefined;
            }

            const currentDocument = currentDocuments.at(-1);

            if (!currentDocument || !currentDocument.content) {
              setIsContentDirty(false);
              toast.error('Document content is missing or invalid');
              return currentDocuments;
            }

            if (currentDocument.content !== updatedContent) {
              try {
                const response = await fetch(`/api/document?id=${artifact.documentId}`, {
                  method: 'POST',
                  body: JSON.stringify({
                    title: artifact.title,
                    content: updatedContent,
                    kind: artifact.kind,
                  }),
                });

                const isSuccess = await handleApiError(response, 'Failed to save document');
                
                if (!isSuccess) {
                  return currentDocuments;
                }

                setIsContentDirty(false);
                toast.success('Document saved successfully');

                const newDocument = {
                  ...currentDocument,
                  content: updatedContent,
                  createdAt: new Date(),
                };

                return [...currentDocuments, newDocument];
              } catch (error) {
                console.error('Error saving document:', error);
                toast.error(`Failed to save document: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return currentDocuments;
              }
            }
            return currentDocuments;
          },
          { revalidate: false },
        );
      } catch (error) {
        console.error('Error in handleContentChange:', error);
        toast.error(`Error updating document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    [artifact, mutate, handleApiError],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      try {
        if (!document) {
          toast.error('Cannot save: Document not found');
          return;
        }
        
        if (updatedContent !== document.content) {
          setIsContentDirty(true);
          
          // Show a saving indicator to the user
          const savingToast = debounce 
            ? toast.loading('Saving document...', { duration: 2000 })
            : toast.loading('Saving document...');

          if (debounce) {
            debouncedHandleContentChange(updatedContent);
          } else {
            handleContentChange(updatedContent)
              .then(() => {
                // If not debounced, we can dismiss the toast when complete
                toast.dismiss(savingToast);
              })
              .catch((error) => {
                toast.dismiss(savingToast);
                console.error('Error in saveContent:', error);
                toast.error(`Failed to save content: ${error instanceof Error ? error.message : 'Unknown error'}`);
              });
          }
        }
      } catch (error) {
        console.error('Error in saveContent:', error);
        toast.error(`Error saving content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    [document, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = useCallback((type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) {
      toast.error('Cannot navigate versions: Document history not available');
      return;
    }

    try {
      if (type === 'latest') {
        setCurrentVersionIndex(documents.length - 1);
        setMode('edit');
        toast.success('Switched to latest version');
      }

      if (type === 'toggle') {
        setMode((mode) => {
          const newMode = mode === 'edit' ? 'diff' : 'edit';
          toast.info(`Switched to ${newMode} mode`);
          return newMode;
        });
      }

      if (type === 'prev') {
        if (currentVersionIndex > 0) {
          setCurrentVersionIndex((index) => {
            const newIndex = index - 1;
            toast.info(`Viewing version ${newIndex + 1} of ${documents.length}`);
            return newIndex;
          });
        } else {
          toast.info('Already at oldest version');
        }
      } else if (type === 'next') {
        if (currentVersionIndex < documents.length - 1) {
          setCurrentVersionIndex((index) => {
            const newIndex = index + 1;
            toast.info(`Viewing version ${newIndex + 1} of ${documents.length}`);
            return newIndex;
          });
        } else {
          toast.info('Already at latest version');
        }
      }
    } catch (error) {
      console.error('Error in handleVersionChange:', error);
      toast.error(`Failed to change document version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [documents, currentVersionIndex]);

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  useEffect(() => {
    if (artifact.documentId !== 'init') {
      try {
        if (artifactDefinition.initialize) {
          artifactDefinition.initialize({
            documentId: artifact.documentId,
            setMetadata,
          });
        }
      } catch (error: unknown) {
        console.error('Error in artifact initialization:', error);
        toast.error(`Error initializing artifact: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <motion.div
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-zinc-100 dark:bg-zinc-900"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.4 } }}
        >
          {!isMobile && (
            <motion.div
              className="fixed bg-background h-dvh"
              initial={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
              animate={{ width: windowWidth, right: 0 }}
              exit={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
            />
          )}

          {!isMobile && (
            <motion.div
              className="relative w-[400px] bg-muted dark:bg-background h-dvh shrink-0"
              initial={{ opacity: 0, x: 10, scale: 1 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: {
                  delay: 0.2,
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                },
              }}
              exit={{
                opacity: 0,
                x: 0,
                scale: 1,
                transition: { duration: 0 },
              }}
            >
              <AnimatePresence>
                {!isCurrentVersion && (
                  <motion.div
                    className="left-0 absolute h-dvh w-[400px] top-0 bg-zinc-900/50 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              <div className="flex flex-col h-full justify-between items-center gap-4">
                <ArtifactMessages
                  chatId={chatId}
                  isLoading={isLoading}
                  votes={votes}
                  messages={messages}
                  setMessages={setMessages}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                />

                <div className="flex flex-row gap-2 relative items-end w-full px-4 pb-4">
                  <MultimodalInput
                    chatId={chatId}
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    isLoading={isLoading}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    append={append}
                    className="bg-background dark:bg-muted"
                    setMessages={setMessages}
                  />
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed dark:bg-zinc-800 bg-zinc-100 h-dvh flex flex-col overflow-y-scroll md:border-l dark:border-zinc-700 border-zinc-200"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth : 'calc(100dvw)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
                : {
                    opacity: 1,
                    x: 400,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth
                      ? windowWidth - 400
                      : 'calc(100dvw-400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: {
                delay: 0.1,
                type: 'spring',
                stiffness: 600,
                damping: 30,
              },
            }}
          >
            <div className="p-2 flex flex-row justify-between items-start">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  <div className="font-medium">{artifact.title}</div>

                  {isContentDirty ? (
                    <div className="text-sm text-muted-foreground">
                      Saving changes...
                    </div>
                  ) : document ? (
                    <div className="text-sm text-muted-foreground">
                      {`Updated ${formatDistance(
                        new Date(document.createdAt),
                        new Date(),
                        {
                          addSuffix: true,
                        },
                      )}`}
                    </div>
                  ) : (
                    <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                  )}
                </div>
              </div>

              <ArtifactActions
                artifact={artifact}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <div className="dark:bg-zinc-800 bg-zinc-100 h-full overflow-y-scroll !max-w-full items-center">
              <artifactDefinition.content
                title={artifact.title}
                content={
                  isCurrentVersion
                    ? artifact.content
                    : getDocumentContentById(currentVersionIndex)
                }
                mode={mode}
                status={artifact.status}
                currentVersionIndex={currentVersionIndex}
                suggestions={[]}
                onSaveContent={saveContent}
                isInline={false}
                isCurrentVersion={isCurrentVersion}
                getDocumentContentById={getDocumentContentById}
                isLoading={isDocumentsFetching && !artifact.content}
                metadata={metadata}
                setMetadata={setMetadata}
              />

              <AnimatePresence>
                {isCurrentVersion && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    isLoading={isLoading}
                    stop={stop}
                    setMessages={setMessages}
                    artifactKind={artifact.kind}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages.length)) return false;

  return true;
});
