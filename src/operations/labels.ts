import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaLabelSchema, type PlankaLabel } from "../common/types.js";

/**
 * Valid color options for labels in Planka
 */
export const VALID_LABEL_COLORS = [
  "berry-red",
  "pumpkin-orange",
  "lagoon-blue",
  "pink-tulip",
  "light-mud",
  "orange-peel",
  "bright-moss",
  "antique-blue",
  "dark-granite",
  "lagune-blue",
  "sunny-grass",
  "morning-sky",
  "light-orange",
  "midnight-blue",
  "tank-green",
  "gun-metal",
  "wet-moss",
  "red-burgundy",
  "light-concrete",
  "apricot-red",
  "desert-sand",
  "navy-blue",
  "egg-yellow",
  "coral-green",
  "light-cocoa",
] as const;

export type LabelColor = (typeof VALID_LABEL_COLORS)[number];

// Schema definitions
export const CreateLabelSchema = z.object({
  boardId: z.string().describe("Board ID"),
  name: z.string().describe("Label name"),
  color: z.enum(VALID_LABEL_COLORS).describe("Label color"),
  position: z.number().optional().describe("Label position (default: 65535)"),
});

export const GetLabelsSchema = z.object({
  boardId: z.string().describe("Board ID"),
});

export const GetLabelSchema = z.object({
  id: z.string().describe("Label ID"),
});

export const UpdateLabelSchema = z.object({
  id: z.string().describe("Label ID"),
  name: z.string().optional().describe("Label name"),
  color: z.enum(VALID_LABEL_COLORS).optional().describe("Label color"),
  position: z.number().optional().describe("Label position"),
});

export const DeleteLabelSchema = z.object({
  id: z.string().describe("Label ID"),
});

export const AddLabelToCardSchema = z.object({
  cardId: z.string().describe("Card ID"),
  labelId: z.string().describe("Label ID"),
});

export const RemoveLabelFromCardSchema = z.object({
  cardId: z.string().describe("Card ID"),
  labelId: z.string().describe("Label ID"),
});

// Inferred types
export type CreateLabelInput = z.infer<typeof CreateLabelSchema>;

// Response schemas
const LabelsResponseSchema = z.object({
  items: z.array(PlankaLabelSchema),
  included: z.record(z.any()).optional(),
});

const LabelResponseSchema = z.object({
  item: PlankaLabelSchema,
  included: z.record(z.any()).optional(),
});

// Function implementations
export async function createLabel(options: CreateLabelInput): Promise<PlankaLabel> {
  try {
    const response = await plankaRequest(`/api/boards/${options.boardId}/labels`, {
      method: "POST",
      body: {
        name: options.name,
        color: options.color,
        position: options.position,
      },
    });
    const parsedResponse = LabelResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to create label: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getLabels(boardId: string): Promise<PlankaLabel[]> {
  try {
    // Get the board which includes labels in the response
    const response = await plankaRequest(`/api/boards/${boardId}`);

    // Check if the response has the expected structure
    if (
      response &&
      typeof response === "object" &&
      "included" in response &&
      response.included &&
      typeof response.included === "object" &&
      "labels" in response.included
    ) {
      // Get the labels from the included property
      const labels = response.included.labels;
      if (Array.isArray(labels)) {
        return labels as PlankaLabel[];
      }
    }

    // If we can't find labels in the expected format, return an empty array
    return [];
  } catch (error) {
    // If all else fails, return an empty array
    return [];
  }
}

export async function updateLabel(id: string, options: Partial<Omit<CreateLabelInput, "boardId">>): Promise<PlankaLabel> {
  try {
    const response = await plankaRequest(`/api/labels/${id}`, {
      method: "PATCH",
      body: options as Record<string, unknown>,
    });
    const parsedResponse = LabelResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to update label: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteLabel(id: string): Promise<{ success: boolean }> {
  try {
    await plankaRequest(`/api/labels/${id}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete label: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function addLabelToCard(cardId: string, labelId: string): Promise<{ success: boolean }> {
  try {
    // The correct endpoint is /api/cards/{cardId}/card-labels with labelId in the body
    await plankaRequest(`/api/cards/${cardId}/card-labels`, {
      method: "POST",
      body: {
        labelId,
      },
    });
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to add label to card: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function removeLabelFromCard(cardId: string, labelId: string): Promise<{ success: boolean }> {
  try {
    // The correct endpoint is /api/cards/{cardId}/card-labels/labelId:{labelId}
    await plankaRequest(`/api/cards/${cardId}/card-labels/labelId:${labelId}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to remove label from card: ${error instanceof Error ? error.message : String(error)}`);
  }
}
