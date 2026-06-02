import { z } from "zod";
import { createCard } from "../operations/cards.js";
import { createTask } from "../operations/tasks.js";
import { createComment } from "../operations/comments.js";
import { type PlankaCard, type PlankaTask, type PlankaComment } from "../common/types.js";

/**
 * Zod schema for the createCardWithTasks function parameters
 */
export const createCardWithTasksSchema = z.object({
  listId: z.string().describe("The ID of the list to create the card in"),
  name: z.string().describe("The name of the card"),
  description: z.string().optional().describe("The description of the card"),
  tasks: z.array(z.string()).optional().describe("Array of task descriptions to create"),
  comment: z.string().optional().describe("Optional comment to add to the card"),
  position: z.number().optional().describe("Optional position for the card in the list"),
});

export type CreateCardWithTasksParams = z.infer<typeof createCardWithTasksSchema>;

export interface CreateCardWithTasksResult {
  card: PlankaCard;
  tasks: PlankaTask[];
  comment: PlankaComment | null;
}

/**
 * Creates a new card with tasks, description, and optional comment in a single operation
 */
export async function createCardWithTasks(params: CreateCardWithTasksParams): Promise<CreateCardWithTasksResult> {
  const { listId, name, description, tasks, comment, position = 65535 } = params;

  try {
    // Create the card
    const card = await createCard({
      listId,
      name,
      description: description || "",
      position,
    });

    // Create tasks if provided
    const createdTasks: PlankaTask[] = [];
    if (tasks && tasks.length > 0) {
      for (let i = 0; i < tasks.length; i++) {
        const taskName = tasks[i];
        // Calculate position for each task (65535, 131070, 196605, etc.)
        const taskPosition = 65535 * (i + 1);
        const task = await createTask({
          cardId: card.id,
          name: taskName,
          position: taskPosition,
        });
        createdTasks.push(task);
      }
    }

    // Add a comment if provided
    let createdComment: PlankaComment | null = null;
    if (comment) {
      createdComment = await createComment({
        cardId: card.id,
        text: comment,
      });
    }

    return {
      card,
      tasks: createdTasks,
      comment: createdComment,
    };
  } catch (error) {
    console.error("Error in createCardWithTasks:", error);
    throw error;
  }
}
