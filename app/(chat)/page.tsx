import { Chat } from '@/app/features/chat/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/utils/auth';
import { nanoid } from 'nanoid';
import { DataStreamHandler } from '@/app/features/data-stream-handler/data-stream-handler';

// Configure page options
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-no-store';

export default function Page() {
  const id = generateUUID();
  
  return (
    <>
      <Chat
        id={id}
        initialMessages={[]}
        selectedChatModel={DEFAULT_CHAT_MODEL}
        selectedVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}


