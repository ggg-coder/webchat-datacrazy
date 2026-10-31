// Shared between the widget (browser) and the API routes. No server imports here.
import { z } from "zod";

export const MAX_TEXT_LENGTH = 4000;

// Base MIME types accepted from visitors. Nothing executable.
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "video/mp4",
] as const;

export const isAllowedUploadType = (mimeType: string) => (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType);

export type FieldMode = "required" | "optional" | "hidden";

export type PublicWidgetConfig = {
  companyName: string;
  privacyUrl: string;
  appearance: {
    title: string;
    subtitle: string;
    avatarUrl: string;
    primaryColor: string;
    textOnPrimary: string;
    position: "right" | "left";
    launcherText: string;
    theme: "light" | "dark" | "auto";
    welcomeMessage: string;
    offlineMessage: string;
    autoOpenSeconds: number;
  };
  form: { name: FieldMode; email: FieldMode; phone: FieldMode; defaultCountry: string; consentText: string; consentVersion: string };
  isOpen: boolean;
  uploads: { enabled: boolean; maxSizeMb: number };
  realtime: { url: string; key: string } | null;
};

export type WidgetMessage = {
  id: string;
  author: "visitor" | "agent" | "system";
  text: string;
  attachment: { url: string; mimeType: string; filename: string } | null;
  status: "sending" | "sent" | "failed" | null;
  createdAt: string;
};

export type StartSessionResponse = { ok: true; token: string; sessionId: string; channel: string; name: string };

const utmValue = z.string().trim().max(200).optional();

export const startSessionSchema = z.object({
  name: z.string().trim().max(80).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  consent: z.boolean().default(false),
  // Honeypot: real visitors never see this field.
  website: z.string().max(200).default(""),
  identified: z.boolean().default(false),
  // Only present when opened from the panel's "Testar" tab.
  testToken: z.string().max(2000).optional(),
  pageUrl: z.string().max(2000).optional(),
  referrer: z.string().max(2000).optional(),
  utm: z.object({ source: utmValue, medium: utmValue, campaign: utmValue, content: utmValue, term: utmValue }).default({}),
});

export const sendMessageSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().max(MAX_TEXT_LENGTH).default(""),
  attachmentId: z.uuid().optional(),
});

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(200),
  size: z.number().int().positive(),
});
