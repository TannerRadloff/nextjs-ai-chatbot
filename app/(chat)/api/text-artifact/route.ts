import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { saveDocument } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';

// Define a type for the system message with document
interface SystemMessageWithDocument {
  id: string;
  chatId: string;
  role: string;
  content: string;
  createdAt: Date;
  documentId?: string;
  artifactTitle?: string;
  artifactKind?: string;
}

// Maximum size for text content in characters
const MAX_TEXT_CONTENT_SIZE = 1000000; // 1MB of text

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { chatId, fileUrl, fileName, textContent } = await request.json();

    if (!chatId || !fileUrl || !textContent) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create a document ID for the text artifact
    const documentId = generateUUID();
    const title = fileName || 'Uploaded Text File';

    // Validate text content more thoroughly
    if (!textContent) {
      console.error('Empty text content');
      return NextResponse.json(
        { error: 'Text content cannot be empty' },
        { status: 400 }
      );
    }
    
    if (typeof textContent !== 'string') {
      console.error('Invalid text content type:', typeof textContent);
      return NextResponse.json(
        { error: 'Text content must be a string' },
        { status: 400 }
      );
    }
    
    if (textContent.length > MAX_TEXT_CONTENT_SIZE) {
      console.error('Text content too large:', textContent.length);
      return NextResponse.json(
        { error: 'Text content is too large. Maximum size is 1MB.' },
        { status: 400 }
      );
    }

    // Log first part of content to verify it's valid
    const contentPreview = textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '');
    console.log('Creating text artifact:', { 
      id: documentId, 
      title, 
      contentLength: textContent.length,
      contentPreview,
      userId: session.user.id 
    });

    // Save the document to the database
    try {
      await saveDocument({
        id: documentId,
        title,
        content: textContent,
        kind: 'text',
        userId: session.user.id,
      });
      
      console.log('Text artifact created successfully');
      
      // Verify the document was saved by trying to retrieve it
      try {
        const { getDocumentById } = await import('@/lib/db/queries');
        const savedDoc = await getDocumentById({ id: documentId });
        if (savedDoc) {
          console.log(`Verified document saved: ID ${documentId}, Content length: ${savedDoc.content?.length || 0}`);
        } else {
          console.error('Document was not found after saving!');
          throw new Error('Document verification failed - not found after saving');
        }
      } catch (verifyError) {
        console.error('Error verifying document save:', verifyError);
        // Don't throw here, we'll still return success since the initial save worked
      }
    } catch (saveError) {
      console.error('Error saving document:', saveError);
      throw saveError;
    }

    // Return the document information with complete details
    return NextResponse.json({
      success: true,
      documentId,
      title,
      kind: 'text',
      contentLength: textContent.length,
    });
  } catch (error) {
    console.error('Error creating text artifact:', error);
    
    // Provide more specific error messages based on the type of error
    let errorMessage = 'Failed to create text artifact';
    let status = 500;
    
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}`);
      if (error.message.includes('database') || error.message.includes('query')) {
        errorMessage = 'Database error when saving document. Please try again.';
      } else if (error.message.includes('content')) {
        errorMessage = 'Error processing document content. The file may be corrupted.';
        status = 400;
      }
    }
    
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 