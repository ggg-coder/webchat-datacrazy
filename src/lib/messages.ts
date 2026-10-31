import "server-only";
import { fileUrl } from "@/lib/files";
import type { MessageRow } from "@/lib/repo";

// Shape sent to the widget (history, Realtime). No internal fields.
export type PublicMessage = {
  id: string;
  author: "visitor" | "agent" | "system";
  text: string;
  attachment: { url: string; mimeType: string; filename: string } | null;
  status: "sending" | "sent" | "failed" | null;
  createdAt: string;
};

export function toPublicMessage(row: MessageRow): PublicMessage {
  const attachment = row.attachment
    ? {
        url: row.attachment.attachmentId ? fileUrl(row.attachment.attachmentId) : (row.attachment.url ?? ""),
        mimeType: row.attachment.mimeType,
        filename: row.attachment.filename,
      }
    : null;
  // "pending" means queued for retry; for the visitor it is still on its way.
  const status =
    row.author !== "visitor" ? null : row.delivery_status === "sent" ? "sent" : row.delivery_status === "failed" ? "failed" : "sending";
  return { id: row.id, author: row.author, text: row.text, attachment, status, createdAt: row.created_at };
}
