"use client";

import dynamic from "next/dynamic";

// Client-only: the widget reads the URL hash, localStorage and talks to the parent page.
const Widget = dynamic(() => import("./widget").then((mod) => mod.Widget), { ssr: false });

export default function EmbedPage() {
  return <Widget />;
}
