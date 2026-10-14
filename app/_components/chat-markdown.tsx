"use client";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";

export function ChatMarkdown({text,streaming=false}:{text:string;streaming?:boolean}) {
  return <Streamdown className="chat-markdown" plugins={{code,math,mermaid,cjk}}
    isAnimating={streaming} components={{
      a: ({href,children}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      strong: ({children}) => <strong>{children}</strong>,
    }}>{text}</Streamdown>;
}
