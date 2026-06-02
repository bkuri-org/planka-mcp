import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaTaskSchema, type PlankaTask } from "../common/types.js";

// Schema definitions
export const CreateTaskSchema = z.object({
  cardId: z.string().describe("Card ID"),
  name: z.string().describe("Task name"),
  position: z.number().optional().describe("Task position (default: 65535)"),
});

export const BatchCreateTasksSchema = z.object({
  tasks: z.array(CreateTaskSchema).describe("Array of tasks to create"),
});

export const GetTasksSchema = z.object({
  cardId: z.string().describe("Card ID"),
});

export const GetTaskSchema = z.object({
  id: z.string().describe("Task ID"),
  cardId: z.string().optional().describe("Card ID containing the task"),
});

export const UpdateTaskSchema = z.object({
  id: z.string().describe("Task ID"),
  name: z.string().optional().describe("Task name"),
  isCompleted: z.boolean().optional().describe("Whether the task is completed"),
  position: z.number().optional().describe("Task position"),
});

export const DeleteTaskSchema = z.object({
  id: z.string().describe("Task ID"),
});

// Inferred types
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// Response schemas
const TasksResponseSchema = z.object({
  items: z.array(PlankaTaskSchema),
  included: z.record(z.any()).optional(),
});

const TaskResponseSchema = z.object({
  item: PlankaTaskSchema,
  included: z.record(z.any()).optional(),
});

// Map to store task ID to card ID mapping
const taskCardIdMap: Record<string, string> = {};

// Cache: cardId -> taskListId
const cardTaskListMap: Record<string, string> = {};

async function getOrCreateTaskList(cardId: string): Promise<string> {
  if (cardTaskListMap[cardId]) {
    return cardTaskListMap[cardId];
  }

  // Get card details to find existing task lists
  const cardResponse = await plankaRequest(`/api/cards/${cardId}`);
  const taskLists = (cardResponse?.included?.taskLists || []) as Array<{ id: string }>;

  if (taskLists.length > 0) {
    cardTaskListMap[cardId] = taskLists[0].id;
    return taskLists[0].id;
  }

  // Create a new task list
  const response = await plankaRequest(`/api/cards/${cardId}/task-lists`, {
    method: "POST",
    body: { name: "Tasks", position: 65535 },
  });

  const taskListId = (response.item as { id: string }).id;
  cardTaskListMap[cardId] = taskListId;
  return taskListId;
}

export async function createTask(params: CreateTaskInput): Promise<PlankaTask> {
  try {
    const { cardId, name, position = 65535 } = params;
    const taskListId = await getOrCreateTaskList(cardId);

    const response = await plankaRequest(`/api/task-lists/${taskListId}/tasks`, {
      method: "POST",
      body: { name, position },
    });

    if (response.item && (response.item as { id: string }).id) {
      taskCardIdMap[(response.item as { id: string }).id] = cardId;
    }

    return response.item as PlankaTask;
  } catch (error) {
    console.error("Error creating task:", error);
    throw new Error(`Failed to create task: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface TaskError {
  index: number;
  task: CreateTaskInput;
  error: string;
}

export interface BatchCreateTasksResult {
  results: Array<{ success: boolean; result?: PlankaTask; error?: { message: string } }>;
  successes: PlankaTask[];
  failures: TaskError[];
}

export async function batchCreateTasks(options: { tasks: CreateTaskInput[] }): Promise<BatchCreateTasksResult> {
  try {
    const results: BatchCreateTasksResult["results"] = [];
    const successes: PlankaTask[] = [];
    const failures: TaskError[] = [];

    // Process each task in sequence
    for (let i = 0; i < options.tasks.length; i++) {
      const task = options.tasks[i];

      // Ensure position is set if not provided
      if (!task.position) {
        task.position = 65535 * (i + 1);
      }

      try {
        const result = await createTask(task);
        results.push({
          success: true,
          result,
        });
        successes.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        results.push({
          success: false,
          error: { message: errorMessage },
        });
        failures.push({
          index: i,
          task,
          error: errorMessage,
        });
      }
    }

    return {
      results,
      successes,
      failures,
    };
  } catch (error) {
    throw new Error(`Failed to batch create tasks: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getTasks(cardId: string): Promise<PlankaTask[]> {
  try {
    // Instead of using the tasks endpoint which returns HTML,
    // we'll get the card details which includes tasks
    const response = await plankaRequest(`/api/cards/${cardId}`);

    // Extract tasks from the card response
    if (response?.included?.tasks && Array.isArray(response.included.tasks)) {
      const tasks = response.included.tasks;
      return tasks as PlankaTask[];
    }

    return [];
  } catch (error) {
    console.error(`Error getting tasks for card ${cardId}:`, error);
    // If there's an error, return an empty array
    return [];
  }
}

export async function getTask(id: string, cardId?: string): Promise<PlankaTask> {
  try {
    // Tasks in Planka are always part of a card, so we need the card ID
    const taskCardId = cardId || taskCardIdMap[id];
    if (!taskCardId) {
      throw new Error("Card ID is required to get a task. Either provide it directly or create the task first.");
    }

    // Get the card details which includes tasks
    const response = await plankaRequest(`/api/cards/${taskCardId}`);
    if (!response?.included?.tasks || !Array.isArray(response.included.tasks)) {
      throw new Error(`Failed to get tasks for card ${taskCardId}`);
    }

    // Find the task with the matching ID
    const task = (response.included.tasks as PlankaTask[]).find((task) => task.id === id);
    if (!task) {
      throw new Error(`Task with ID ${id} not found in card ${taskCardId}`);
    }

    return task;
  } catch (error) {
    console.error(`Error getting task with ID ${id}:`, error);
    throw new Error(`Failed to get task: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateTask(id: string, options: Record<string, unknown>): Promise<PlankaTask> {
  const response = await plankaRequest(`/api/tasks/${id}`, {
    method: "PATCH",
    body: options,
  });
  const parsedResponse = TaskResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function deleteTask(id: string): Promise<{ success: boolean }> {
  await plankaRequest(`/api/tasks/${id}`, {
    method: "DELETE",
  });
  return { success: true };
}
