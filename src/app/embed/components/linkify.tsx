import { Fragment, type ReactNode } from "react";

const URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

// Messages are rendered as plain text; only URLs become links, opened safely in a new tab.
export function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    // Trailing punctuation usually belongs to the sentence, not the URL.
    const raw = match[0].replace(/[.,;:!?)\]]+$/, "");
    if (index > last) parts.push(text.slice(last, index));
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a key={index} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 break-all">
        {raw}
      </a>,
    );
    last = index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
