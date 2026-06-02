/**
 * @fileoverview Attachment operations for the MCP Kanban server
 *
 * Provides functions for uploading, updating, deleting, and downloading
 * card attachments via the Planka API.
 */
import { z } from "zod";
import { plankaRequest } from "../common/utils.js";

// Schema definitions
export const UploadAttachmentSchema = z.object({
    cardId: z.string().describe("Card ID"),
    file: z.instanceof(File).describe("File to upload"),
    name: z.string().optional().describe("Override filename (defaults to file name)"),
});

export const UpdateAttachmentSchema = z.object({
    id: z.string().describe("Attachment ID"),
    name: z.string().describe("New name for the attachment"),
});

export const DeleteAttachmentSchema = z.object({
    id: z.string().describe("Attachment ID"),
});

export const GetAttachmentUrlSchema = z.object({
    id: z.string().describe("Attachment ID"),
    filename: z.string().describe("Filename"),
    baseUrl: z.string().optional().describe("Planka base URL (defaults to PLANKA_BASE_URL)"),
});

export interface PlankaAttachment {
    id: string;
    cardId: string;
    userId: string;
    name: string;
    url: string;
    createdAt: string;
    updatedAt: string | null;
}

export interface UploadAttachmentOptions {
    cardId: string;
    file: File;
    name?: string;
}

export interface UploadTextOptions {
    cardId: string;
    content: string;
    filename: string;
}

/**
 * Upload a file as a card attachment
 */
export async function uploadAttachment(options: UploadAttachmentOptions): Promise<PlankaAttachment> {
    const formData = new FormData();
    const filename = options.name || options.file.name;
    formData.append("type", "file");
    formData.append("name", filename);
    formData.append("file", options.file, filename);

    // Bypass plankaRequest for multipart — use raw fetch
    const baseUrl = process.env.PLANKA_BASE_URL || "http://localhost:3000";
    const normalizedBaseUrl = baseUrl.endsWith("/api") ? baseUrl.slice(0, -4) : baseUrl;

    // Authenticate
    const authUrl = `${normalizedBaseUrl}/api/access-tokens`;
    const email = process.env.PLANKA_AGENT_EMAIL || "";
    const password = process.env.PLANKA_AGENT_PASSWORD || "";
    const authResp = await fetch(authUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({emailOrUsername: email, password}),
    });
    const authData = await authResp.json();
    const token = authData.item;
    if (!token) throw new Error(`Auth failed: ${JSON.stringify(authData)}`);

    // Upload
    const url = `${normalizedBaseUrl}/api/cards/${options.cardId}/attachments`;
    const response = await fetch(url, {
        method: "POST",
        headers: {"Authorization": `Bearer ${token}`},
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(`Upload failed (${response.status}): ${JSON.stringify(errorBody)}`);
    }

    const data = await response.json();
    return data.item as unknown as PlankaAttachment;
}

/**
 * Update an attachment's name
 */
export async function updateAttachment(id: string, options: { name: string }): Promise<PlankaAttachment> {
    const response = await plankaRequest(`/api/attachments/${id}`, {
        method: "PATCH",
        body: { name: options.name },
    });
    return response.item as unknown as PlankaAttachment;
}

/**
 * Upload text content as a file attachment
 *
 * Creates a Blob from the text string, wraps it in a File, then uploads
 * via multipart/form-data. Useful for transcripts, notes, etc.
 */
export async function uploadText(options: UploadTextOptions): Promise<PlankaAttachment> {
    const blob = new Blob([options.content], { type: "text/plain;charset=utf-8" });
    const file = new File([blob], options.filename, { type: "text/plain;charset=utf-8" });
    return uploadAttachment({ cardId: options.cardId, file });
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(id: string): Promise<{ success: boolean }> {
    await plankaRequest(`/api/attachments/${id}`, {
        method: "DELETE",
    });
    return { success: true };
}

/**
 * Get the download URL for an attachment
 *
 * The download URL follows Planka's format:
 *   GET /attachments/:id/download/:filename
 */
export function getAttachmentUrl(id: string, filename: string, baseUrl?: string): string {
    const base = baseUrl || process.env.PLANKA_BASE_URL || "http://localhost:3000";
    const normalized = base.endsWith("/api") ? base.slice(0, -4) : base;
    return `${normalized}/attachments/${id}/download/${encodeURIComponent(filename)}`;
}

/**
 * List attachments for a card (extracted from card's included data)
 */
export function extractAttachmentsFromCard(cardData: Record<string, unknown>): PlankaAttachment[] {
    const included = cardData.included as Record<string, unknown> | undefined;
    if (!included) return [];
    const raw = included.attachments as unknown[] | undefined;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is PlankaAttachment => a !== null && typeof a === "object" && "id" in a);
}
