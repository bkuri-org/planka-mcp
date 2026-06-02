import { z } from "zod";
import { plankaRequest, PlankaResponse } from "../common/utils.js";

// Schema definitions
export const CreateBoardMembershipSchema = z.object({
  boardId: z.string().describe("Board ID"),
  userId: z.string().describe("User ID"),
  role: z.enum(["editor", "viewer"]).describe("Membership role (editor or viewer)"),
});

export const GetBoardMembershipsSchema = z.object({
  boardId: z.string().describe("Board ID"),
});

export const GetBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
});

export const UpdateBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
  role: z.enum(["editor", "viewer"]).describe("Membership role (editor or viewer)"),
  canComment: z.boolean().optional().describe("Whether the user can comment on cards"),
});

export const DeleteBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
});

// Inferred types
export type CreateBoardMembershipInput = z.infer<typeof CreateBoardMembershipSchema>;
export type UpdateBoardMembershipInput = z.infer<typeof UpdateBoardMembershipSchema>;

// Board membership schema
const BoardMembershipSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  userId: z.string(),
  role: z.string(),
  canComment: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export type BoardMembership = z.infer<typeof BoardMembershipSchema>;

// Response schemas
const BoardMembershipsResponseSchema = z.object({
  items: z.array(BoardMembershipSchema),
  included: z.record(z.any()).optional(),
});

const BoardMembershipResponseSchema = z.object({
  item: BoardMembershipSchema,
  included: z.record(z.any()).optional(),
});

// Function implementations
export async function createBoardMembership(options: CreateBoardMembershipInput): Promise<BoardMembership> {
  try {
    const response = await plankaRequest(`/api/boards/${options.boardId}/memberships`, {
      method: "POST",
      body: {
        userId: options.userId,
        role: options.role,
      },
    });
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to create board membership: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getBoardMemberships(boardId: string): Promise<BoardMembership[]> {
  try {
    const response = await plankaRequest(`/api/boards/${boardId}/memberships`);
    try {
      // Try to parse as a BoardMembershipsResponseSchema first
      const parsedResponse = BoardMembershipsResponseSchema.parse(response);
      return parsedResponse.items;
    } catch (parseError) {
      // If that fails, try to parse as an array directly
      if (Array.isArray(response)) {
        return z.array(BoardMembershipSchema).parse(response);
      }
      // If we get here, we couldn't parse the response in any expected format
      throw new Error(`Could not parse board memberships response: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    // If all else fails, return an empty array
    return [];
  }
}

export async function getBoardMembership(id: string): Promise<BoardMembership> {
  try {
    const response = await plankaRequest(`/api/board-memberships/${id}`);
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to get board membership: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateBoardMembership(id: string, options: Partial<Omit<CreateBoardMembershipInput, "boardId" | "userId">>): Promise<BoardMembership> {
  try {
    const response = await plankaRequest(`/api/board-memberships/${id}`, {
      method: "PATCH",
      body: options as Record<string, unknown>,
    });
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to update board membership: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteBoardMembership(id: string): Promise<{ success: boolean }> {
  try {
    await plankaRequest(`/api/board-memberships/${id}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete board membership: ${error instanceof Error ? error.message : String(error)}`);
  }
}
