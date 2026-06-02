import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaCommentSchema, type PlankaComment } from "../common/types.js";

// Schema definitions
export const CreateCommentSchema = z.object({
  cardId: z.string().describe("Card ID"),
  text: z.string().describe("Comment text"),
});

export const GetCommentsSchema = z.object({
  cardId: z.string().describe("Card ID"),
});

export const GetCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
});

export const UpdateCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
  text: z.string().describe("Comment text"),
});

export const DeleteCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
});

// Inferred types
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

/**
 * Creates a new comment on a card
 */
export async function createComment(options: CreateCommentInput): Promise<PlankaComment> {
  try {
    const response = await plankaRequest(`/api/cards/${options.cardId}/comments`, {
      method: "POST",
      body: {
        text: options.text,
      },
    });
    return response.item as PlankaComment;
  } catch (error) {
    throw new Error(`Failed to create comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieves all comments for a specific card
 */
export async function getComments(cardId: string): Promise<PlankaComment[]> {
  try {
    const response = await plankaRequest(`/api/cards/${cardId}/comments`);
    if (response && response.items) {
      return response.items as PlankaComment[];
    }
    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Retrieves a specific comment by ID
 */
export async function getComment(id: string): Promise<PlankaComment> {
  try {
    const response = await plankaRequest(`/api/comments/${id}`);
    return response.item as PlankaComment;
  } catch (error) {
    throw new Error(`Failed to get comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Updates a comment's text content
 */
export async function updateComment(id: string, options: { text: string }): Promise<PlankaComment> {
  try {
    const response = await plankaRequest(`/api/comments/${id}`, {
      method: "PATCH",
      body: {
        text: options.text,
      },
    });
    return response.item as PlankaComment;
  } catch (error) {
    throw new Error(`Failed to update comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Deletes a comment by ID
 */
export async function deleteComment(id: string): Promise<{ success: boolean }> {
  try {
    await plankaRequest(`/api/comments/${id}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}
