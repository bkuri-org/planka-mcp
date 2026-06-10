import { z } from "zod";
import { getBoard } from "../operations/boards.js";
import { getLists } from "../operations/lists.js";
import { plankaRequest } from "../common/utils.js";
import { getTasks } from "../operations/tasks.js";
import { getLabels } from "../operations/labels.js";
import { getComments } from "../operations/comments.js";
import { type PlankaBoard, type PlankaCard, type PlankaTask, type PlankaComment, type PlankaLabel } from "../common/types.js";

/**
 * Zod schema for the getBoardSummary function parameters
 */
export const getBoardSummarySchema = z.object({
  boardId: z.string().describe("The ID of the board to get a summary for"),
  includeTaskDetails: z.boolean().optional().default(false).describe("Whether to include detailed task information for each card"),
  includeComments: z.boolean().optional().default(false).describe("Whether to include comments for each card"),
});

export type GetBoardSummaryParams = z.infer<typeof getBoardSummarySchema>;

export interface BoardSummaryStats {
  totalCards: number;
  backlogCount: number;
  inProgressCount: number;
  testingCount: number;
  doneCount: number;
  urgentCount: number;
  bugCount: number;
  completionPercentage: number;
}

export interface BoardWorkflowState {
  hasCardsInBacklog: boolean;
  hasCardsInProgress: boolean;
  hasCardsInTesting: boolean;
  nextActionSuggestion: string;
}

export interface ListWithCards {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string | null;
  cards: (PlankaCard & {
    tasks?: {
      items: PlankaTask[];
      total: number;
      completed: number;
      completionPercentage: number;
    };
    comments?: PlankaComment[];
  })[];
  cardCount: number;
}

export interface BoardSummary {
  board: PlankaBoard;
  lists: ListWithCards[];
  labels: PlankaLabel[];
  stats: BoardSummaryStats;
  workflowState: BoardWorkflowState;
}

/**
 * Retrieves a comprehensive summary of a board including lists, cards, tasks, and statistics
 */
export async function getBoardSummary(params: GetBoardSummaryParams): Promise<BoardSummary> {
  const { boardId, includeTaskDetails, includeComments } = params;

  try {
    // Get the board details
    const board = await getBoard(boardId);
    if (!board) {
      throw new Error(`Board with ID ${boardId} not found`);
    }

    // Get all lists on the board
    const allLists = await getLists(boardId);

    // Fetch the board once — included.cards contains ALL cards for the board
    const boardResponse = await plankaRequest(`/api/boards/${boardId}`);
    const allCards = (
      boardResponse?.included?.cards && Array.isArray(boardResponse.included.cards)
        ? boardResponse.included.cards
        : []) as PlankaCard[];

    // Group cards by listId (O(n) single pass, zero extra API calls)
    const cardsByListId = new Map<string, PlankaCard[]>();
    for (const card of allCards) {
      const existing = cardsByListId.get(card.listId);
      if (existing) {
        existing.push(card);
      } else {
        cardsByListId.set(card.listId, [card]);
      }
    }

    // Build list summaries using pre-grouped cards
    const listsWithCards: ListWithCards[] = await Promise.all(
      allLists.map(async (list) => {
        const listCards = cardsByListId.get(list.id) ?? [];

        // Get tasks for each card if requested
        const cardsWithDetails = await Promise.all(
          listCards.map(async (card) => {
            let taskDetails: PlankaTask[] = [];
            if (includeTaskDetails) {
              taskDetails = await getTasks(card.id);
            }

            // Get comments if requested
            let cardComments: PlankaComment[] = [];
            if (includeComments) {
              cardComments = await getComments(card.id);
            }

            // Calculate task completion percentage
            const completedTasks = taskDetails.filter((task) => task.isCompleted).length;
            const totalTasks = taskDetails.length;
            const completionPercentage = totalTasks > 0
              ? Math.round((completedTasks / totalTasks) * 100)
              : 0;

            return {
              ...card,
              tasks: includeTaskDetails
                ? {
                    items: taskDetails,
                    total: totalTasks,
                    completed: completedTasks,
                    completionPercentage,
                  }
                : undefined,
              comments: includeComments ? cardComments : undefined,
            };
          })
        );

        return {
          ...list,
          cards: cardsWithDetails,
          cardCount: cardsWithDetails.length,
        };
      })
    );

    // Get all labels for the board
    const boardLabels = await getLabels(boardId);

    // Calculate overall statistics
    const totalCards = listsWithCards.reduce((sum, list) => sum + list.cardCount, 0);

    // Find specific lists by name
    const backlogList = listsWithCards.find((list) => list.name?.toLowerCase() === "backlog");
    const inProgressList = listsWithCards.find((list) => list.name?.toLowerCase() === "in progress");
    const testingList = listsWithCards.find((list) => list.name?.toLowerCase() === "testing");
    const doneList = listsWithCards.find((list) => list.name?.toLowerCase() === "done");

    // Count cards with specific labels
    const urgentCards = listsWithCards
      .flatMap((list) => list.cards)
      .filter((card) =>
        (card as unknown as { labelIds?: string[] }).labelIds?.some((labelId: string) =>
          boardLabels.find((label) => label.id === labelId && label.name.toLowerCase() === "urgent")
        )
      ).length;

    const bugCards = listsWithCards
      .flatMap((list) => list.cards)
      .filter((card) =>
        (card as unknown as { labelIds?: string[] }).labelIds?.some((labelId: string) =>
          boardLabels.find((label) => label.id === labelId && label.name.toLowerCase() === "bug")
        )
      ).length;

    return {
      board,
      lists: listsWithCards,
      labels: boardLabels,
      stats: {
        totalCards,
        backlogCount: backlogList?.cardCount || 0,
        inProgressCount: inProgressList?.cardCount || 0,
        testingCount: testingList?.cardCount || 0,
        doneCount: doneList?.cardCount || 0,
        urgentCount: urgentCards,
        bugCount: bugCards,
        completionPercentage:
          totalCards > 0 ? Math.round(((doneList?.cardCount || 0) / totalCards) * 100) : 0,
      },
      workflowState: {
        hasCardsInBacklog: (backlogList?.cardCount || 0) > 0,
        hasCardsInProgress: (inProgressList?.cardCount || 0) > 0,
        hasCardsInTesting: (testingList?.cardCount || 0) > 0,
        nextActionSuggestion: getNextActionSuggestion(
          backlogList?.cardCount || 0,
          inProgressList?.cardCount || 0,
          testingList?.cardCount || 0
        ),
      },
    };
  } catch (error) {
    console.error("Error in getBoardSummary:", error);
    throw error;
  }
}

/**
 * Helper function to suggest the next action based on board state
 */
function getNextActionSuggestion(backlogCount: number, inProgressCount: number, testingCount: number): string {
  if (testingCount > 0) {
    return "Review cards in Testing that need feedback";
  } else if (inProgressCount > 0) {
    return "Continue working on cards in In Progress";
  } else if (backlogCount > 0) {
    return "Start working on a card from Backlog";
  } else {
    return "All tasks complete! Create new cards or projects";
  }
}
