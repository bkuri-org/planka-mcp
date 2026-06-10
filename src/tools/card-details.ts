import { z } from "zod";
import { getCard, getCachedBoardId, resolveBoardIdForList } from "../operations/cards.js";
import { getTasks } from "../operations/tasks.js";
import { getComments } from "../operations/comments.js";
import { getLabels } from "../operations/labels.js";
import { type PlankaCard, type PlankaTask, type PlankaComment, type PlankaLabel } from "../common/types.js";

/**
 * Zod schema for the getCardDetails function parameters
 */
export const getCardDetailsSchema = z.object({
  cardId: z.string().describe("The ID of the card to get details for"),
});

export type GetCardDetailsParams = z.infer<typeof getCardDetailsSchema>;

export interface CardDetailsAnalysis {
  hasRecentHumanFeedback: boolean;
  isComplete: boolean;
  needsAttention: boolean;
}

export interface CardDetails {
  card: PlankaCard;
  taskItems: PlankaTask[];
  taskStats: {
    total: number;
    completed: number;
    completionPercentage: number;
  };
  comments: PlankaComment[];
  labels: PlankaLabel[];
  analysis: CardDetailsAnalysis;
}

/**
 * Retrieves comprehensive details about a card including tasks, comments, labels, and analysis
 */
export async function getCardDetails(params: GetCardDetailsParams): Promise<CardDetails> {
  const { cardId } = params;

  try {
    // Get the card details
    const card = await getCard(cardId);
    if (!card) {
      throw new Error(`Card with ID ${cardId} not found`);
    }

    // Get tasks for the card
    const tasks = await getTasks(card.id);

    // Get comments for the card
    const comments = await getComments(card.id);

    // Find the board ID using the cached list→board mapping
    // (populate via resolveBoardIdForList if not already cached)
    const boardId = await resolveBoardIdForList(card.listId);

    if (!boardId) {
      throw new Error(`Could not determine board ID for card ${cardId}`);
    }

    const labels = await getLabels(boardId);

    // Calculate task completion percentage
    const completedTasks = tasks.filter((task) => task.isCompleted).length;
    const totalTasks = tasks.length;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Sort comments by date (newest first)
    const sortedComments = comments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Check if the most recent comment is likely from a human (not the LLM)
    // This is a heuristic and might need adjustment
    const latestComment = sortedComments[0] as PlankaComment & { data?: { text?: string } };
    const hasRecentHumanFeedback: boolean = !!(
      sortedComments.length > 0 &&
      latestComment.data &&
      !latestComment.data.text?.includes("Implemented feature") &&
      !latestComment.data.text?.includes("Awaiting human review")
    );

    return {
      card,
      taskItems: tasks,
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        completionPercentage,
      },
      comments: sortedComments,
      labels,
      analysis: {
        hasRecentHumanFeedback,
        isComplete: completionPercentage === 100,
        needsAttention: hasRecentHumanFeedback || completedTasks === 0,
      },
    };
  } catch (error) {
    console.error("Error in getCardDetails:", error);
    throw error;
  }
}
