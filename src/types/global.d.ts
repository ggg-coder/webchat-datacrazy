// API exposed by public/widget.js on the customer's page.
interface Window {
  DCWebchat?: {
    open(): void;
    close(): void;
    toggle(): void;
    identify(visitor: { name?: string; email?: string; phone?: string }): void;
  };
}
