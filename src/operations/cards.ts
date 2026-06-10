import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaCardSchema, PlankaCard, PlankaStopwatch } from "../common/types.js";

// Cache: listId -> boardId (populated on demand, never expires within a session)
const listToBoardCache: Record<string, string> = {};

/**
 * Resolve a listId to its boardId using the projects index.
 * Populates listToBoardCache for all lists discovered.
 * Falls back to iterating boards only if the list is not in any
 * project's included boards (e.g. newly created board not yet indexed).
 */
export async function resolveBoardIdForList(listId: string): Promise<string | null> {
  // Check cache first
  if (listToBoardCache[listId]) {
    return listToBoardCache[listId];
  }

  // GET /api/projects returns included.boards — no per-board requests needed
  const projectsResponse = await plankaRequest(`/api/projects`);
  if (
    !projectsResponse ||
    typeof projectsResponse !== "object" ||
    !("included" in projectsResponse) ||
    !projectsResponse.included
  ) {
    return null;
  }

  const included = projectsResponse.included;

  // Check if boards are in included (projects index includes boards with projectId)
  if ("boards" in included && Array.isArray(included.boards)) {
    // The projects index doesn't include lists, so we need to fetch each board
    // But this is still better than before — we only need to find which board
    // contains this list. We parallelize the board fetches.
    const boards = included.boards as Array<{ id: string; projectId: string }>;

    // Fetch all boards in parallel to find the one containing this list
    const boardResponses = await Promise.all(
      boards.map((board) => plankaRequest(`/api/boards/${board.id}`))
    );

    for (const boardResponse of boardResponses) {
      if (
        !boardResponse ||
        typeof boardResponse !== "object" ||
        !("included" in boardResponse) ||
        !boardResponse.included
      ) {
        continue;
      }

      const boardIncluded = boardResponse.included;
      if ("lists" in boardIncluded && Array.isArray(boardIncluded.lists)) {
        for (const list of boardIncluded.lists as Array<{ id: string }>) {
          // Cache ALL list→board mappings we discover
          listToBoardCache[list.id] = (boardResponse.item as { id: string })?.id ?? "";
        }
      }

      if (listToBoardCache[listId]) {
        return listToBoardCache[listId];
      }
    }
  }

  return null;
}

/**
 * Look up a listId's boardId from the cache (no API call).
 */
export function getCachedBoardId(listId: string): string | null {
  return listToBoardCache[listId] ?? null;
}

/**
 * Invalidate the list-to-board cache (e.g. after list creation/move).
 */
export function invalidateListToBoardCache(listId?: string): void {
  if (listId) {
    delete listToBoardCache[listId];
  } else {
    Object.keys(listToBoardCache).forEach((k) => delete listToBoardCache[k]);
  }
}

// Schema definitions
export const CreateCardSchema = z.object({
  listId: z.string().describe("List ID"),
  name: z.string().describe("Card name"),
  description: z.string().optional().describe("Card description"),
  position: z.number().optional().describe("Card position (default: 65535)"),
});

export const GetCardsSchema = z.object({
  listId: z.string().describe("List ID"),
});

export const GetCardSchema = z.object({
  id: z.string().describe("Card ID"),
});

export const UpdateCardSchema = z.object({
  id: z.string().describe("Card ID"),
  name: z.string().optional().describe("Card name"),
  description: z.string().optional().describe("Card description"),
  position: z.number().optional().describe("Card position"),
  dueDate: z.string().optional().describe("Card due date (ISO format)"),
  isCompleted: z.boolean().optional().describe("Whether the card is completed"),
});

export const MoveCardSchema = z.object({
  id: z.string().describe("Card ID"),
  listId: z.string().describe("Target list ID"),
  position: z.number().optional().describe("Card position in the target list (default: 65535)"),
});

export const DuplicateCardSchema = z.object({
  id: z.string().describe("Card ID to duplicate"),
  position: z.number().optional().describe("Position for the duplicated card (default: 65535)"),
});

export const DeleteCardSchema = z.object({
  id: z.string().describe("Card ID"),
});

// Stopwatch schemas
export const StartCardStopwatchSchema = z.object({
  id: z.string().describe("Card ID"),
});

export const StopCardStopwatchSchema = z.object({
  id: z.string().describe("Card ID"),
});

export const GetCardStopwatchSchema = z.object({
  id: z.string().describe("Card ID"),
});

export const ResetCardStopwatchSchema = z.object({
  id: z.string().describe("Card ID"),
});

// Inferred types
export type CreateCardInput = z.infer<typeof CreateCardSchema>;

// Response schemas
const CardsResponseSchema = z.object({
  items: z.array(PlankaCardSchema),
  included: z.record(z.any()).optional(),
});

const CardResponseSchema = z.object({
  item: PlankaCardSchema,
  included: z.record(z.any()).optional(),
});

// Stopwatch info return type
export interface StopwatchInfo {
  isRunning: boolean;
  total: number;
  current: number;
  startedAt: string | null | undefined;
  formattedTotal: string;
  formattedCurrent: string;
}

// Function implementations
export async function createCard(options: CreateCardInput): Promise<PlankaCard> {
  try {
    const response = await plankaRequest(`/api/lists/${options.listId}/cards`, {
      method: "POST",
      body: {
        name: options.name,
        description: options.description,
        position: options.position,
        type: "project",
      },
    });
    const parsedResponse = CardResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to create card: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getCards(listId: string): Promise<PlankaCard[]> {
  try {
    // Resolve listId -> boardId (cached after first lookup)
    const boardId = await resolveBoardIdForList(listId);
    if (!boardId) {
      return [];
    }

    // Single API call: GET /api/boards/{boardId} returns included.cards
    const boardResponse = await plankaRequest(`/api/boards/${boardId}`);
    if (
      !boardResponse ||
      typeof boardResponse !== "object" ||
      !("included" in boardResponse) ||
      !boardResponse.included
    ) {
      return [];
    }

    const boardIncluded = boardResponse.included;
    if (!("cards" in boardIncluded) || !Array.isArray(boardIncluded.cards)) {
      return [];
    }

    const cards = boardIncluded.cards as PlankaCard[];
    return cards.filter(
      (card) => typeof card === "object" && card !== null && "listId" in card && card.listId === listId
    );
  } catch (error) {
    console.error(`Error in getCards for list ${listId}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function getCard(id: string): Promise<PlankaCard> {
  const response = await plankaRequest(`/api/cards/${id}`);
  const parsedResponse = CardResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function updateCard(id: string, options: Record<string, unknown>): Promise<PlankaCard> {
  const response = await plankaRequest(`/api/cards/${id}`, {
    method: "PATCH",
    body: options,
  });
  const parsedResponse = CardResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function moveCard(
  cardId: string,
  listId: string,
  position: number = 65535,
  boardId?: string,
  projectId?: string
): Promise<PlankaCard> {
  try {
    // Use the PATCH endpoint to update the card with the new list ID and position
    const response = await plankaRequest(`/api/cards/${cardId}`, {
      method: "PATCH",
      body: {
        listId,
        position,
        boardId,
        projectId,
      },
    });
    // Parse and return the updated card
    const parsedResponse = CardResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to move card: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function duplicateCard(id: string, position?: number): Promise<PlankaCard> {
  try {
    // First, get the original card to access its name
    const originalCard = await getCard(id);

    // Create a new card with "Copy of" prefix
    const cardName = originalCard ? `Copy of ${originalCard.name}` : "";

    // Get the list ID from the original card
    const listId = originalCard ? originalCard.listId : "";

    if (!listId) {
      throw new Error("Could not determine list ID for card duplication");
    }

    // Create a new card with the same properties but with "Copy of" prefix
    const newCard = await createCard({
      listId,
      name: cardName,
      description: originalCard.description || "",
      position: position || 65535,
    });

    return newCard;
  } catch (error) {
    throw new Error(`Failed to duplicate card: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteCard(id: string): Promise<{ success: boolean }> {
  await plankaRequest(`/api/cards/${id}`, {
    method: "DELETE",
  });
  return { success: true };
}

// Stopwatch functions
export async function startCardStopwatch(id: string): Promise<PlankaCard> {
  try {
    // Get the current card to check if a stopwatch is already running
    const card = await getCard(id);

    // Calculate the stopwatch object
    const stopwatch: PlankaStopwatch = {
      startedAt: new Date().toISOString(),
      total: 0,
    };

    // If there's an existing stopwatch, preserve the total time
    if (card.stopwatch && card.stopwatch.total) {
      stopwatch.total = card.stopwatch.total;
    }

    // Update the card with the new stopwatch
    const response = await plankaRequest(`/api/cards/${id}`, {
      method: "PATCH",
      body: { stopwatch },
    });
    const parsedResponse = CardResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to start card stopwatch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stopCardStopwatch(id: string): Promise<PlankaCard> {
  try {
    // Get the current card to calculate elapsed time
    const card = await getCard(id);

    // If there's no stopwatch or it's not running, return the card as is
    if (!card.stopwatch || !card.stopwatch.startedAt) {
      return card;
    }

    // Calculate elapsed time
    const startedAt = new Date(card.stopwatch.startedAt);
    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

    // Calculate the new total time
    const totalSeconds = (card.stopwatch.total || 0) + elapsedSeconds;

    // Update the card with the stopped stopwatch (null startedAt but preserved total)
    const stopwatch: PlankaStopwatch = {
      startedAt: null,
      total: totalSeconds,
    };

    const response = await plankaRequest(`/api/cards/${id}`, {
      method: "PATCH",
      body: { stopwatch },
    });
    const parsedResponse = CardResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to stop card stopwatch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getCardStopwatch(id: string): Promise<StopwatchInfo> {
  try {
    const card = await getCard(id);

    // If there's no stopwatch, return default values
    if (!card.stopwatch) {
      return {
        isRunning: false,
        total: 0,
        current: 0,
        startedAt: undefined,
        formattedTotal: formatDuration(0),
        formattedCurrent: formatDuration(0),
      };
    }

    // Calculate current elapsed time if stopwatch is running
    let currentElapsed = 0;
    const isRunning = !!card.stopwatch.startedAt;
    if (isRunning && card.stopwatch.startedAt) {
      const startedAt = new Date(card.stopwatch.startedAt);
      const now = new Date();
      currentElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    }

    return {
      isRunning,
      total: card.stopwatch.total || 0,
      current: currentElapsed,
      startedAt: card.stopwatch.startedAt,
      formattedTotal: formatDuration(card.stopwatch.total || 0),
      formattedCurrent: formatDuration(currentElapsed),
    };
  } catch (error) {
    throw new Error(`Failed to get card stopwatch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resetCardStopwatch(id: string): Promise<PlankaCard> {
  try {
    // Set stopwatch to null to clear it
    const response = await plankaRequest(`/api/cards/${id}`, {
      method: "PATCH",
      body: { stopwatch: null },
    });
    const parsedResponse = CardResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(`Failed to reset card stopwatch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Formats a duration in seconds to a human-readable string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  let result = "";
  if (hours > 0) {
    result += `${hours}h `;
  }
  if (minutes > 0 || hours > 0) {
    result += `${minutes}m `;
  }
  result += `${remainingSeconds}s`;
  return result.trim();
}
