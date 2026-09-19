"use client";

import { ExternalLinkIcon, FileTextIcon, ImageIcon, LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { formatBytes, getFileType, getWebUrl } from "@/lib/chat-attachments";

type ChatAttachmentProps = {
  readonly filename?: string;
  readonly mediaType?: string;
  readonly url?: string;
  readonly size?: number;
  readonly kind?: "file" | "link";
  readonly onRemove?: () => void;
};

export function ChatAttachment({
  filename,
  mediaType = "application/octet-stream",
  url,
  size,
  kind = "file",
  onRemove,
}: ChatAttachmentProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const webUrl = url ? getWebUrl(url) : undefined;
  const isImage = kind === "file" && mediaType.startsWith("image/");
  const imageUrl = isImage && url && (
    webUrl || url.startsWith("blob:") || /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(url)
  ) ? url : undefined;
  const label = kind === "link" ? webUrl?.hostname ?? "Link" : filename || "Attached file";
  const detail = kind === "link"
    ? url
    : [getFileType(mediaType, filename), formatBytes(size)].filter(Boolean).join(" · ");
  const href = webUrl?.href ?? (kind === "file" && url?.startsWith("blob:") ? url : undefined);
  const Icon = kind === "link" ? LinkIcon : isImage ? ImageIcon : FileTextIcon;

  const content = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {imageUrl && imageUrl !== failedImage ? (
          <img alt="" className="size-full object-cover" onError={() => setFailedImage(imageUrl)} src={imageUrl} />
        ) : <Icon aria-hidden="true" className="size-5" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium" title={label}>{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={detail}>{detail}</span>
      </span>
    </>
  );

  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border bg-card p-2.5 text-card-foreground shadow-xs sm:max-w-80">
      {href && !onRemove ? (
        <a className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring" href={href} rel="noopener noreferrer" target="_blank">
          {content}
          <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
      ) : <span className="flex min-w-0 flex-1 items-center gap-3">{content}</span>}
      {onRemove ? (
        <button aria-label={`Remove ${label}`} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onRemove} type="button">
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
