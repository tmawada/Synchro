import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get the stored TickTick access token for a user.
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'ticktick' },
    });
    return account?.ticktickAccessToken || null;
  }

  private headers(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get projects/lists from TickTick
   */
  async getProjects(accessToken: string): Promise<TickTickProject[]> {
    try {
      const response = await fetch(`${this.baseUrl}/project`, {
        headers: this.headers(accessToken),
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
   * Get the Inbox project (the inbox is never listed in /project).
   * Returns the project object plus its active tasks.
   */
  async getInbox(accessToken: string): Promise<{ project: TickTickProject | null; tasks: TickTickTask[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/project/inbox/data`, {
        headers: this.headers(accessToken),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to fetch inbox:', response.status, errorText);
        return { project: null, tasks: [] };
      }

      const data = (await response.json()) as {
        project?: TickTickProject;
        tasks?: TickTickTask[];
      };

      // Fallback: some responses omit the project object — derive the id from a task
      let project = data.project || null;
      if (!project && Array.isArray(data.tasks) && data.tasks.length > 0) {
        project = {
          id: data.tasks[0].projectId,
          name: 'Inbox',
          color: '',
          sortOrder: 0,
          kind: 'TASK',
          closed: false,
          viewMode: 'list',
          createdTime: '',
          modifiedTime: '',
        };
      }

      return { project, tasks: Array.isArray(data.tasks) ? data.tasks : [] };
    } catch (error) {
      console.error('[TickTick] Error fetching inbox:', error);
      return { project: null, tasks: [] };
    }
  }

  /**
   * Get active tasks from a single project.
   */
  private async getProjectTasks(accessToken: string, projectId: string): Promise<TickTickTask[]> {
    try {
      const response = await fetch(`${this.baseUrl}/project/${projectId}/data`, {
        headers: this.headers(accessToken),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TickTick] Failed to fetch tasks for project ${projectId}:`, response.status, errorText);
        return [];
      }

      const data = (await response.json()) as { tasks?: TickTickTask[] };
      return Array.isArray(data.tasks) ? data.tasks : [];
    } catch (error) {
      console.error(`[TickTick] Error fetching tasks for project ${projectId}:`, error);
      return [];
    }
  }

  /**
   * Get completed tasks across ALL projects (including the Inbox) via the
   * global POST /task/completed endpoint. TickTick limits the date range,
   * so we query the last 90 days in TickTick's timestamp format
   * (YYYY-MM-DDTHH:mm:ss+0000, no milliseconds).
   */
  async getCompletedTasks(accessToken: string): Promise<TickTickTask[]> {
    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const formatDate = (d: Date) => d.toISOString().split('.')[0] + '+0000';

      const response = await fetch(`${this.baseUrl}/task/completed`, {
        method: 'POST',
        headers: this.headers(accessToken),
        body: JSON.stringify({
          startDate: formatDate(ninetyDaysAgo),
          endDate: formatDate(tomorrow),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to fetch completed tasks:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      // The endpoint returns a raw array of completed tasks
      const completedTasks = Array.isArray(data) ? data : (data.tasks || []);
      // Ensure status is 2 so the frontend's completed filter picks them up
      return (Array.isArray(completedTasks) ? completedTasks : []).map((t: TickTickTask) => ({
        ...t,
        status: 2,
      }));
    } catch (error) {
      console.error('[TickTick] Error fetching completed tasks:', error);
      return [];
    }
  }

  /**
   * Get ALL active tasks: every project's tasks + inbox.
   * Completed tasks are excluded — they come from getCompletedOnly()
   * (dedicated GET /ticktick/completed endpoint).
   */
  async getTasks(accessToken: string): Promise<TickTickTasksResponse> {
    const projects = await this.getProjects(accessToken);
    const taskMap = new Map<string, TickTickTask>();
    const projectIds = new Set(projects.map((p) => p.id));

    // Inbox first — its id is needed to avoid double-fetching in the loop below
    const inbox = await this.getInbox(accessToken);
    if (inbox.project && !projectIds.has(inbox.project.id)) {
      projects.push(inbox.project);
      projectIds.add(inbox.project.id);
    }
    inbox.tasks.forEach((t) => taskMap.set(t.id, t));

    for (const project of projects) {
      if (inbox.project && project.id === inbox.project.id) continue;
      const tasks = await this.getProjectTasks(accessToken, project.id);
      tasks.forEach((t) => taskMap.set(t.id, t));
    }

    // Exclude completed — the frontend merges in GET /ticktick/completed separately
    const tasks = Array.from(taskMap.values()).filter((t) => t.status !== 2);
    return { tasks, projects };
  }

  /**
   * Get ONLY inbox tasks (active), with the inbox project attached.
   */
  async getInboxTasks(accessToken: string): Promise<TickTickTasksResponse> {
    const inbox = await this.getInbox(accessToken);
    const projects: TickTickProject[] = inbox.project ? [inbox.project] : [];
    return { tasks: inbox.tasks, projects };
  }

  /**
   * Get ONLY completed tasks across all projects.
   * Projects are included so the converter can resolve project names.
   */
  async getCompletedOnly(accessToken: string): Promise<TickTickTasksResponse> {
    const projects = await this.getProjects(accessToken);
    const inbox = await this.getInbox(accessToken);
    if (inbox.project && !projects.some((p) => p.id === inbox.project!.id)) {
      projects.push(inbox.project);
    }

    const tasks = await this.getCompletedTasks(accessToken);
    return { tasks, projects };
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
        headers: this.headers(accessToken),
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
    body: { title?: string; priority?: number; dueDate?: string | null; status?: number },
  ): Promise<boolean> {
    const payload: Record<string, unknown> = { projectId, ...body };

    // TickTick expects a full timestamp; keep it an all-day task when user falls back on dueDate
    if (payload.dueDate === null || payload.dueDate === '') {
      // Explicitly clear the date (null removes it; an empty string is ignored by TickTick)
      payload.dueDate = null;
    } else if (typeof payload.dueDate === 'string') {
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
        headers: this.headers(accessToken),
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
          headers: this.headers(accessToken),
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
   * Mark a task as incomplete on TickTick (moves it back to the active list).
   * The Open API has no uncomplete endpoint — updating the task with
   * status 0 does the job.
   */
  async uncompleteTask(accessToken: string, projectId: string, taskId: string): Promise<boolean> {
    return this.updateTask(accessToken, projectId, taskId, { status: 0 });
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
          headers: { Authorization: `Bearer ${accessToken}` },
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
    dueDate: string | null;
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

    // Parse due date — stay empty when the task has none
    let dueDate: string | null = null;
    if (ticktickTask.dueDate) {
      const date = new Date(ticktickTask.dueDate);
      if (!isNaN(date.getTime())) {
        dueDate = date.toISOString().split('T')[0];
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

  /**
   * Store or update TickTick token for a user.
   * Called when user connects TickTick account.
   */
  async setTickTickToken(userId: string, accessToken: string, refreshToken?: string, ticktickId?: string) {
    const existingAccount = await this.prisma.account.findFirst({
      where: { userId, provider: 'ticktick' },
    });

    if (existingAccount) {
      return this.prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          ticktickAccessToken: accessToken,
          ticktickRefreshToken: refreshToken || existingAccount.ticktickRefreshToken,
          ticktickId: ticktickId || existingAccount.ticktickId,
          ticktickTokenExpiry: refreshToken ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null, // 30 days default
        },
      });
    }

    // Create new TickTick account entry
    return this.prisma.account.create({
      data: {
        provider: 'ticktick',
        providerAccountId: ticktickId || `ticktick_${userId}`,
        ticktickAccessToken: accessToken,
        ticktickRefreshToken: refreshToken,
        ticktickId: ticktickId,
        ticktickTokenExpiry: refreshToken ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        userId,
      },
    });
  }

  /**
   * Disconnect TickTick account (remove tokens)
   */
  async disconnectTickTick(userId: string) {
    const ticktickAccount = await this.prisma.account.findFirst({
      where: { userId, provider: 'ticktick' },
    });

    if (ticktickAccount) {
      await this.prisma.account.delete({
        where: { id: ticktickAccount.id },
      });
    }

    return { success: true };
  }

  /**
   * Check if user has TickTick connected
   */
  async isConnected(userId: string): Promise<boolean> {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'ticktick' },
      select: { ticktickAccessToken: true },
    });
    return !!account?.ticktickAccessToken;
  }
}
