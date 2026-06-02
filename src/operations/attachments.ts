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

/**
 * Upload a file as a card attachment
 */
export async function uploadAttachment(options: UploadAttachmentOptions): Promise<PlankaAttachment> {
    const formData = new FormData();
    formData.append("file", options.file, options.name || options.file.name);
    const response = await plankaRequest(`/api/cards/${options.cardId}/attachments`, {
        method: "POST",
        body: formData,
    });
    return response.item as unknown as PlankaAttachment;
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
