import type { ExtendedAttachment } from '@/types';

import { FileIcon, LoaderIcon } from '@/src/components/common/icons';
import { FileText } from 'lucide-react';

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
}: {
  attachment: ExtendedAttachment;
  isUploading?: boolean;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div className="flex flex-col gap-2">
      <div className="w-20 h-16 aspect-video bg-muted rounded-md relative flex-col-center">
        {contentType ? (
          contentType.startsWith('image') ? (
            // NOTE: it is recommended to use next/image for images
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={name ?? 'An image attachment'}
              className="rounded-md size-full object-cover"
            />
          ) : contentType === 'application/pdf' ? (
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-center size-full"
            >
              <FileIcon size={32} />
            </a>
          ) : contentType === 'text/plain' ? (
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-center size-full"
            >
              <FileText className="size-8 text-blue-500" />
            </a>
          ) : (
            <div className="" />
          )
        ) : (
          <div className="" />
        )}

        {isUploading && (
          <div className="animate-spin absolute text-zinc-500">
            <LoaderIcon />
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-500 max-w-16 truncate">{name}</div>
    </div>
  );
};
