import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TickTickTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  timeZone?: string;
  priority: number; // 0=none, 1=low, 3=medium, 5=high
  isAllDay: boolean;
  status: number; // 0=normal, 2=completed
  completedTime?: string;
  sortOrder: number;
  createdTime: string;
  modifiedTime: string;
  items?: TickTickChecklistItem[];
}

export interface TickTickChecklistItem {
  id: string;
  title: string;
  status: number;
  sortOrder: number;
}

export interface TickTickProject {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  kind: string; // "TASK", "NOTE"
  closed: boolean;
  viewMode: string;
  createdTime: string;
  modifiedTime: string;
}

export interface TickTickTasksResponse {
  tasks: TickTickTask[];
  projects: TickTickProject[];
}

@Injectable()
export class TickTickService {
  private readonly baseUrl = 'https://api.ticktick.com/open/v1';

  constructor(private configService: ConfigService) {}

  /**
   * Get all tasks from TickTick Open API v1 (personal access token)
   * The Open API has no batch "get all tasks" endpoint, so we fetch
   * every project's tasks via GET /project/{id}/data, plus the inbox
   * via GET /project/inbox/data (inbox is never listed in /project).
   */
  async getTasks(accessToken: string): Promise<TickTickTasksResponse> {
    try {
      const projects = await this.getProjects(accessToken);
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const tasks: TickTickTask[] = [];

      for (const project of projects) {
        try {
          const response = await fetch(`${this.baseUrl}/project/${project.id}/data`, { headers });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `[TickTick] Failed to fetch tasks for project ${project.id}:`,
              response.status,
              errorText,
            );
            continue;
          }

          const data = (await response.json()) as { tasks?: TickTickTask[] };
          if (Array.isArray(data.tasks)) {
            tasks.push(...data.tasks);
          }
        } catch (error) {
          console.error(`[TickTick] Error fetching project ${project.id}:`, error);
        }
      }

      // Inbox: returned by a dedicated endpoint, with no "project" field,
      // so discover the real inbox id from a returned task's projectId
      const inboxResponse = await fetch(`${this.baseUrl}/project/inbox/data`, { headers });
      if (inboxResponse.ok) {
        const inboxData = (await inboxResponse.json()) as { tasks?: TickTickTask[] };
        if (Array.isArray(inboxData.tasks) && inboxData.tasks.length > 0) {
          tasks.push(...inboxData.tasks);

          const inboxId = inboxData.tasks[0].projectId;
          if (!projects.some((p) => p.id === inboxId)) {
            projects.push({
              id: inboxId,
              name: 'Inbox',
              color: '',
              sortOrder: 0,
              kind: 'TASK',
              closed: false,
              viewMode: 'list',
              createdTime: '',
              modifiedTime: '',
            });
          }
        }
      } else {
        const errorText = await inboxResponse.text();
        console.error('[TickTick] Failed to fetch inbox tasks:', inboxResponse.status, errorText);
      }

      return { tasks, projects };
    } catch (error) {
      console.error('[TickTick] Error fetching tasks:', error);
      throw error;
    }
  }

  /**
   * Get projects/lists from TickTick
   */
  async getProjects(accessToken: string): Promise<TickTickProject[]> {
    try {
      const response = await fetch(`${this.baseUrl}/project`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to fetch projects:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      return data as TickTickProject[];
    } catch (error) {
      console.error('[TickTick] Error fetching projects:', error);
      return [];
    }
  }

  /**
   * Create a task on TickTick.
   * Open API: POST /task (projectId omitted => created in Inbox).
   */
  async createTask(
    accessToken: string,
    body: { title: string; projectId?: string; priority?: number; dueDate?: string; content?: string },
  ): Promise<TickTickTask> {
    const payload: Record<string, unknown> = { title: body.title };

    if (body.projectId) payload.projectId = body.projectId;
    if (body.content) payload.content = body.content;
    if (body.priority !== undefined) payload.priority = body.priority;

    if (typeof body.dueDate === 'string') {
      const date = new Date(body.dueDate);
      if (!isNaN(date.getTime())) {
        payload.dueDate = date.toISOString().replace('Z', '+0000');
        payload.isAllDay = true;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to create task:', response.status, errorText);
        throw new Error(`TickTick API error: ${response.status} - ${errorText}`);
      }

      return (await response.json()) as TickTickTask;
    } catch (error) {
      console.error('[TickTick] Error creating task:', error);
      throw error;
    }
  }

  /**
   * Update task fields (title/priority/dueDate/status) on TickTick.
   * Open API: POST /task/{taskId} with projectId in the body.
   */
  async updateTask(
    accessToken: string,
    projectId: string,
    taskId: string,
    body: { title?: string; priority?: number; dueDate?: string; status?: number },
  ): Promise<boolean> {
    const payload: Record<string, unknown> = { projectId, ...body };

    // TickTick expects a full timestamp; keep it an all-day task when user falls back on dueDate
    if (typeof payload.dueDate === 'string') {
      const date = new Date(payload.dueDate);
      if (!isNaN(date.getTime())) {
        payload.dueDate = date.toISOString().replace('Z', '+0000');
        payload.isAllDay = true;
      } else {
        delete payload.dueDate;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to update task:', response.status, errorText);
        throw new Error(`TickTick API error: ${response.status} - ${errorText}`);
      }
      return true;
    } catch (error) {
      console.error('[TickTick] Error updating task:', error);
      throw error;
    }
  }

  /**
   * Mark a task complete on TickTick.
   * Open API: POST /project/{projectId}/task/{taskId}/complete
   */
  async completeTask(accessToken: string, projectId: string, taskId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/project/${projectId}/task/${taskId}/complete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to complete task:', response.status, errorText);
        throw new Error(`TickTick API error: ${response.status} - ${errorText}`);
      }
      return true;
    } catch (error) {
      console.error('[TickTick] Error completing task:', error);
      throw error;
    }
  }

  /**
   * Delete a task on TickTick.
   * Open API: DELETE /project/{projectId}/task/{taskId}
   */
  async deleteTask(accessToken: string, projectId: string, taskId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/project/${projectId}/task/${taskId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to delete task:', response.status, errorText);
        throw new Error(`TickTick API error: ${response.status} - ${errorText}`);
      }
      return true;
    } catch (error) {
      console.error('[TickTick] Error deleting task:', error);
      throw error;
    }
  }

  /**
   * Convert TickTick task to Synchro task format
   */
  convertToSynchroTask(
    ticktickTask: TickTickTask,
    projects: TickTickProject[]
  ): {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high';
    listType: 'work' | 'personal' | 'routine';
    duration: number;
    dueDate: string;
    completed: boolean;
    emailRef: null;
    source: 'ticktick';
    ticktickId: string;
    projectId: string;
    projectName: string;
  } {
    // Map priority: 0/1=low, 3=medium, 5=high
    let priority: 'low' | 'medium' | 'high' = 'low';
    if (ticktickTask.priority >= 5) priority = 'high';
    else if (ticktickTask.priority >= 3) priority = 'medium';
    else priority = 'low';

    // Find project name to map to listType
    const project = projects.find((p) => p.id === ticktickTask.projectId);
    const projectName = project?.name || 'Unknown';

    // Map project name to listType (can be customized by user later)
    let listType: 'work' | 'personal' | 'routine' = 'personal';
    const nameLower = projectName.toLowerCase();
    if (nameLower.includes('work') || nameLower.includes('job') || nameLower.includes('office') || nameLower.includes('project')) {
      listType = 'work';
    } else if (nameLower.includes('routine') || nameLower.includes('habit') || nameLower.includes('daily') || nameLower.includes('morning') || nameLower.includes('evening')) {
      listType = 'routine';
    }

    // Parse due date
    let dueDate = new Date().toISOString().split('T')[0];
    if (ticktickTask.dueDate) {
      try {
        const date = new Date(ticktickTask.dueDate);
        dueDate = date.toISOString().split('T')[0];
      } catch {
        // fallback to today
      }
    }

    // Default duration based on priority
    const duration = priority === 'high' ? 60 : priority === 'medium' ? 45 : 30;

    return {
      id: `ticktick_${ticktickTask.id}`,
      title: ticktickTask.title,
      priority,
      listType,
      duration,
      dueDate,
      completed: ticktickTask.status === 2,
      emailRef: null,
      source: 'ticktick',
      ticktickId: ticktickTask.id,
      projectId: ticktickTask.projectId,
      projectName,
    };
  }
}