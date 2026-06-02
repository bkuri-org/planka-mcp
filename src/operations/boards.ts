import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaBoardSchema, type PlankaBoard } from "../common/types.js";
import { getAdminUserId } from "../common/setup.js";
import * as boardMemberships from "./boardMemberships.js";
import * as lists from "./lists.js";
import * as labels from "./labels.js";

// Schema definitions
export const CreateBoardSchema = z.object({
  projectId: z.string().describe("Project ID"),
  name: z.string().describe("Board name"),
  position: z.number().default(65535).describe("Board position (default: 65535)"),
});

export const GetBoardsSchema = z.object({
  projectId: z.string().describe("Project ID"),
});

export const GetBoardSchema = z.object({
  id: z.string().describe("Board ID"),
});

export const UpdateBoardSchema = z.object({
  id: z.string().describe("Board ID"),
  name: z.string().optional().describe("Board name"),
  position: z.number().optional().describe("Board position"),
  type: z.string().optional().describe("Board type"),
});

export const DeleteBoardSchema = z.object({
  id: z.string().describe("Board ID"),
});

// Inferred types
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;
export type UpdateBoardInput = z.infer<typeof UpdateBoardSchema>;

// Response schemas
const BoardsResponseSchema = z.object({
  items: z.array(PlankaBoardSchema),
  included: z.record(z.any()).optional(),
});

const BoardResponseSchema = z.object({
  item: PlankaBoardSchema,
  included: z.record(z.any()).optional(),
});

// Function implementations
async function createDefaultLists(boardId: string): Promise<void> {
  try {
    const defaultLists = [
      { name: "Backlog", position: 65535 },
      { name: "To Do", position: 131070 },
      { name: "In Progress", position: 196605 },
      { name: "On Hold", position: 262140 },
      { name: "Review", position: 327675 },
      { name: "Done", position: 393210 },
    ];
    for (const list of defaultLists) {
      await lists.createList({
        boardId,
        name: list.name,
        position: list.position,
      });
    }
  } catch (error) {
    console.error(`Error creating default lists for board ${boardId}:`, error instanceof Error ? error.message : String(error));
  }
}

async function createDefaultLabels(boardId: string): Promise<void> {
  try {
    // Priority labels
    const priorityLabels = [
      { name: "P0: Critical", color: "berry-red", position: 65535 },
      { name: "P1: High", color: "red-burgundy", position: 131070 },
      { name: "P2: Medium", color: "pumpkin-orange", position: 196605 },
      { name: "P3: Low", color: "sunny-grass", position: 262140 },
    ];

    // Type labels
    const typeLabels = [
      { name: "Bug", color: "coral-green", position: 327675 },
      { name: "Feature", color: "lagoon-blue", position: 393210 },
      { name: "Enhancement", color: "bright-moss", position: 458745 },
      { name: "Documentation", color: "light-orange", position: 524280 },
    ];

    // Status labels
    const statusLabels = [
      { name: "Blocked", color: "midnight-blue", position: 589815 },
      { name: "Needs Info", color: "desert-sand", position: 655350 },
      { name: "Ready", color: "egg-yellow", position: 720885 },
    ];

    // Combine all labels
    const defaultLabels = [
      ...priorityLabels,
      ...typeLabels,
      ...statusLabels,
    ];

    for (const label of defaultLabels) {
      await labels.createLabel({
        boardId,
        name: label.name,
        color: label.color as "berry-red",
        position: label.position,
      });
    }
  } catch (error) {
    console.error(`Error creating default labels for board ${boardId}:`, error instanceof Error ? error.message : String(error));
  }
}

export async function createBoard(options: CreateBoardInput): Promise<PlankaBoard> {
  try {
    const response = await plankaRequest(`/api/projects/${options.projectId}/boards`, {
      method: "POST",
      body: {
        name: options.name,
        position: options.position,
      },
    });
    const parsedResponse = BoardResponseSchema.parse(response);
    const board = parsedResponse.item;

    // Add the admin user as a board member
    try {
      const adminUserId = await getAdminUserId();
      if (adminUserId) {
        await boardMemberships.createBoardMembership({
          boardId: board.id,
          userId: adminUserId,
          role: "editor",
        });
      } else {
        console.error("Could not add admin user as board member: Admin user ID not found");
      }
    } catch (error) {
      console.error("Error adding admin user as board member:", error);
    }

    // Create default lists and labels
    await createDefaultLists(board.id);
    await createDefaultLabels(board.id);

    return board;
  } catch (error) {
    throw new Error(`Failed to create board: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getBoards(projectId: string): Promise<PlankaBoard[]> {
  try {
    // Get all projects which includes boards in the response
    const response = await plankaRequest(`/api/projects`);

    // Check if the response has the expected structure
    if (
      response &&
      typeof response === "object" &&
      "included" in response &&
      response.included &&
      typeof response.included === "object" &&
      "boards" in response.included
    ) {
      // Filter boards by projectId
      const allBoards = response.included.boards;
      if (Array.isArray(allBoards)) {
        const filteredBoards = allBoards.filter(
          (board) =>
            typeof board === "object" &&
            board !== null &&
            "projectId" in board &&
            (board as { projectId: string }).projectId === projectId
        );
        return filteredBoards as PlankaBoard[];
      }
    }

    // If we can't find boards in the expected format, return an empty array
    return [];
  } catch (error) {
    // If all else fails, return an empty array
    return [];
  }
}

export async function getBoard(id: string): Promise<PlankaBoard> {
  const response = await plankaRequest(`/api/boards/${id}`);
  const parsedResponse = BoardResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function updateBoard(id: string, options: Partial<Omit<CreateBoardInput, "projectId">>): Promise<PlankaBoard> {
  const response = await plankaRequest(`/api/boards/${id}`, {
    method: "PATCH",
    body: options as Record<string, unknown>,
  });
  const parsedResponse = BoardResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function deleteBoard(id: string): Promise<{ success: boolean }> {
  await plankaRequest(`/api/boards/${id}`, {
    method: "DELETE",
  });
  return { success: true };
}
