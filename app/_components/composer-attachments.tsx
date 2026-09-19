"use client";

import { LinkIcon, PaperclipIcon } from "lucide-react";
import { useId, useState } from "react";
import {
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputHeader,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getMessageLinks, getWebUrl, removeMessageLink } from "@/lib/chat-attachments";
import { ChatAttachment } from "./chat-attachment";

export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  const { textInput } = usePromptInputController();
  const links = getMessageLinks(textInput.value);
  const count = attachments.files.length + links.length;

  return (
    <>
      <span aria-live="polite" className="sr-only" role="status">
        {count > 0 ? `${count} ${count === 1 ? "attachment" : "attachments"} ready to send.` : ""}
      </span>
      {count > 0 ? (
        <PromptInputHeader className="block px-3 pt-3 pb-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Attached · {count}</p>
          <div aria-label="Message attachments" className="grid max-h-44 w-full grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {attachments.files.map((file) => (
              <ChatAttachment key={file.id} {...file} onRemove={() => attachments.remove(file.id)} />
            ))}
            {links.map((url) => (
              <ChatAttachment key={url} kind="link" onRemove={() => textInput.setInput(removeMessageLink(textInput.value, url))} url={url} />
            ))}
          </div>
        </PromptInputHeader>
      ) : null}
    </>
  );
}

export function ComposerAttachMenu({ disabled }: { readonly disabled: boolean }) {
  const { textInput } = usePromptInputController();
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const inputId = useId();

  const addLink = () => {
    const value = link.trim();
    if (!getWebUrl(value)) {
      setError("Enter a complete link beginning with https:// or http://.");
      return;
    }
    if (!getMessageLinks(textInput.value).includes(value)) {
      textInput.setInput([textInput.value.trimEnd(), value].filter(Boolean).join("\n"));
    }
    setLinkOpen(false);
    setLink("");
    setError(undefined);
  };

  return (
    <>
      <PromptInputActionMenu modal={false}>
        <PromptInputActionMenuTrigger aria-label="Attach files or links" disabled={disabled} tooltip="Attach files or links">
          <PaperclipIcon aria-hidden="true" className="size-4" />
        </PromptInputActionMenuTrigger>
        <PromptInputActionMenuContent>
          <PromptInputActionAddAttachments />
          <PromptInputActionMenuItem onSelect={() => { setError(undefined); setLinkOpen(true); }}>
            <LinkIcon aria-hidden="true" className="mr-2 size-4" /> Add a link
          </PromptInputActionMenuItem>
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
      <Dialog onOpenChange={setLinkOpen} open={linkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>Include a page for Turi to reference with your message.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={inputId}>Link URL</label>
            <Input aria-describedby={error ? `${inputId}-error` : undefined} aria-invalid={Boolean(error)} autoComplete="off" id={inputId} onChange={(event) => { setLink(event.target.value); setError(undefined); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} placeholder="https://example.com/document" type="url" value={link} />
            {error ? <p className="text-sm text-destructive" id={`${inputId}-error`} role="alert">{error}</p> : null}
          </div>
          <Button onClick={addLink} type="button">Add link</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
