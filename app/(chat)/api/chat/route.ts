import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  saveDocument,
  getDocumentById,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';
import { ExtendedAttachment } from '@/types';

import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';

export const maxDuration = 60;

// Maximum size for file content in characters
const MAX_FILE_CONTENT_SIZE = 10000;

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
    experimental_attachments,
  }: { 
    id: string; 
    messages: Array<Message>; 
    selectedChatModel: string;
    experimental_attachments?: ExtendedAttachment[];
  } = await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Check if there are any document artifact messages
  const hasArtifacts = messages.some(message => 
    message.role === 'system' && 'documentId' in message && message.documentId
  );

  // Find the most recent user message
  const userMessage = getMostRecentUserMessage(messages);

  // If there's no user message but there are artifacts, this is an initial artifact-only state
  // We'll create a chat but won't require a user message yet
  if (!userMessage && !hasArtifacts) {
    return new Response('No user message found', { status: 400 });
  }

  try {
    // Get or create the chat
    const chat = await getChatById({ id });

    if (!chat) {
      // For new chats with only artifacts, use a generic title
      let title = 'New Document';
      if (userMessage) {
        title = await generateTitleFromUserMessage({ message: userMessage });
      } else if (hasArtifacts) {
        // Try to use the artifact title if available
        const artifactMessage = messages.find(message => 
          message.role === 'system' && 'artifactTitle' in message
        );
        if (artifactMessage && 'artifactTitle' in artifactMessage) {
          title = `Document: ${artifactMessage.artifactTitle}`;
        }
      }
      
      await saveChat({ id, userId: session.user.id, title });
    }

    // Save the user message to the database (if any)
    if (userMessage) {
      await saveMessages({
        messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
      });
    }

    // Find document artifacts in messages and save them if they're new
    const documentMessages = messages.filter(message => 
      message.role === 'system' && 'documentId' in message && message.documentId
    );
    
    if (documentMessages.length > 0) {
      try {
        await saveMessages({
          messages: documentMessages.map(message => ({
            ...message,
            chatId: id,
            createdAt: new Date(),
          })),
        });
      } catch (error) {
        console.error('Error saving document messages:', error);
        // Continue processing even if message saving fails
      }
    }

    // If there's no user message yet (just artifacts), we're done
    if (!userMessage) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Artifacts saved' 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL FIX: If we have document artifacts and a user message, modify the user message to include document content
    let processedMessages = [...messages]; // Create a mutable copy of the messages array
    
    if (hasArtifacts && userMessage) {
      try {
        let documentContents = '';
        
        // Get the content of each referenced document
        for (const docMessage of documentMessages) {
          if (docMessage && 'documentId' in docMessage && docMessage.documentId) {
            try {
              const documentId = String(docMessage.documentId);
              console.log(`Fetching document with ID: ${documentId}`);
              
              const document = await getDocumentById({ id: documentId });
              
              if (document && document.content) {
                console.log(`Found document: ${document.title}, content length: ${document.content.length}`);
                const truncatedContent = document.content.length > MAX_FILE_CONTENT_SIZE 
                  ? document.content.substring(0, MAX_FILE_CONTENT_SIZE) + "... [content truncated]" 
                  : document.content;
                
                documentContents += `\n\n--- Document: ${document.title} ---\n${truncatedContent}\n\n`;
              } else {
                console.error(`Document not found or has no content: ${documentId}`);
              }
            } catch (error) {
              console.error('Error retrieving document:', error);
              // Continue with other documents if one fails
            }
          }
        }
        
        // Create a copy of the message array, replacing the user message with an enhanced version
        if (documentContents) {
          const enhancedUserMessage = {
            ...userMessage,
            content: `I'm asking about this document:\n${documentContents}\n\nMy question: ${userMessage.content}`
          };
          
          // Make a clean copy without document references to avoid serialization issues
          processedMessages = processedMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.id === userMessage.id ? enhancedUserMessage.content : msg.content,
            createdAt: msg.createdAt
          }));
          
          // Filter out system messages with document artifacts since they've been merged into the user message
          processedMessages = processedMessages.filter(message => 
            !(message.role === 'system' && 'documentId' in message)
          );
        } else {
          console.warn('No document contents found despite having document references');
          // If we couldn't get document contents, create a clean copy without the problematic fields
          processedMessages = processedMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt
          }));
        }
      } catch (error) {
        console.error('Error enhancing user message with document content:', error);
        // If document enhancement fails, create a clean copy without the problematic fields
        processedMessages = processedMessages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt
        }));
      }
    }

    // Use the standard system prompt
    const enhancedSystemPrompt = (model: string) => {
      return systemPrompt({ selectedChatModel: model });
    };

    return createDataStreamResponse({
      execute: (dataStream) => {
        // Special handling for o1 model
        if (selectedChatModel === 'gpt-o1') {
          console.log('Using o1 model with reasoningEffort: medium and store: true');
          
          // For o1 model, we need to use a direct OpenAI client to add the store parameter
          // Import the OpenAI client
          const OpenAI = require('openai');
          
          // Get the OpenAI API key from environment variables
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
          }
          
          // Initialize the OpenAI client with the API key
          const openai = new OpenAI.OpenAI({
            apiKey: apiKey
          });
          
          // Create a custom handler for o1 model
          const handleO1Model = async () => {
            try {
              // First, convert the messages to the format expected by the OpenAI API
              const apiMessages = processedMessages.map(msg => ({
                role: msg.role,
                content: msg.content
              }));
              
              // Add the system message
              apiMessages.unshift({
                role: 'system',
                content: enhancedSystemPrompt(selectedChatModel)
              });
              
              // Make the API call with the required parameters
              const response = await openai.chat.completions.create({
                model: 'o1',
                reasoningEffort: 'medium',
                messages: apiMessages,
                store: true,
                stream: true
              });
              
              // Process the streaming response
              for await (const chunk of response) {
                if (chunk.choices[0]?.delta?.content) {
                  dataStream.writeData({
                    type: 'text',
                    content: chunk.choices[0].delta.content
                  });
                }
              }
              
              // Signal that the stream is complete
              dataStream.writeData({ 
                type: 'finish', 
                content: '' 
              });
            } catch (error: unknown) {
              console.error('Error with o1 model:', error);
              
              // Provide a more specific error message based on the error type
              let errorMessage = 'An error occurred with the o1 model. Please try again or select a different model.';
              
              // Check if error is an Error object with a message property
              if (error instanceof Error) {
                if (error.message.includes('API key')) {
                  errorMessage = 'OpenAI API key is missing or invalid. Please check your environment configuration.';
                } else if (error.message.includes('rate limit') || error.message.includes('capacity')) {
                  errorMessage = 'The AI service is currently experiencing high demand. Please try again in a few moments.';
                } else if (error.message.includes('context length')) {
                  errorMessage = 'The input is too large for the model to process. Please try with a smaller input.';
                } else if (error.message.includes('store')) {
                  errorMessage = 'There was an issue with the store parameter. Please try again with a different model.';
                } else if (error.message.includes('reasoningEffort')) {
                  errorMessage = 'There was an issue with the reasoningEffort parameter. Please try again with a different model.';
                }
              }
              
              // Write the error message to the data stream
              dataStream.writeData({
                type: 'error',
                content: errorMessage
              });
              
              // Signal that the stream is complete
              dataStream.writeData({ 
                type: 'finish', 
                content: '' 
              });
            }
          };
          
          // Start the custom handler
          handleO1Model();
        } else {
          // Use the standard model for other models
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: enhancedSystemPrompt(selectedChatModel),
            messages: processedMessages,
            maxSteps: 5,
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            },
            onFinish: async ({ response, reasoning }) => {
              if (session.user?.id) {
                try {
                  const sanitizedResponseMessages = sanitizeResponseMessages({
                    messages: response.messages,
                    reasoning,
                  });

                  await saveMessages({
                    messages: sanitizedResponseMessages.map((message) => {
                      return {
                        id: message.id,
                        chatId: id,
                        role: message.role,
                        content: message.content,
                        createdAt: new Date(),
                      };
                    }),
                  });
                } catch (error) {
                  console.error('Failed to save chat', error);
                }
              }
            },
            experimental_telemetry: {
              isEnabled: true,
              functionId: 'stream-text',
            },
          });

          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });
        }
      },
      onError: (error: unknown) => {
        console.error('Chat API error:', error);
        if (error instanceof Error) {
          // Check for specific error types
          if (error.message.includes('context length')) {
            return 'The file content is too large for the model to process. Please try with a smaller file or extract the most relevant parts.';
          } else if (error.message.includes('model') || error.message.includes('Model')) {
            return 'There was an issue with the selected AI model. Please try selecting a different model from the dropdown.';
          } else if (error.message.includes('rate limit') || error.message.includes('capacity')) {
            return 'The AI service is currently experiencing high demand. Please try again in a few moments.';
          }
        }
        return 'Oops, an error occurred while processing your request. Please try again with a smaller file or different content.';
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in chat API:', error);
    
    // Provide more detailed error information based on the type of error
    let errorMessage = 'An unexpected error occurred. Please try again.';
    let statusCode = 500;
    
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      
      if (error.message.includes('document') || error.message.includes('Document')) {
        errorMessage = 'Error processing document. The file might be corrupted or too large.';
      } else if (error.message.includes('database') || error.message.includes('query')) {
        errorMessage = 'Database error. Please try again later.';
      } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
        errorMessage = 'The request timed out. Please try with a smaller file or simpler query.';
      }
    }
    
    return new Response(errorMessage, { status: statusCode });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}

