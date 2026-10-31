"use client";

// Same widget the site gets, opened as if it were embedded on a page of the site. Client-only: the
// address depends on window.location. The token marks the conversation as a test on the server.
export default function TestChat({ token }: { token: string }) {
  const origin = window.location.origin;
  const params = new URLSearchParams({ host: origin, page: `${origin}/admin/testar`, utm_source: "teste-painel", test: token });
  return <iframe title="Chat de teste" src={`/embed#${params}`} className="h-full w-full" allow="microphone; clipboard-write" />;
}
