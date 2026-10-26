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
  private readonly baseUrl = 'https://api.ticktick.com/v1';

  constructor(private configService: ConfigService) {}

  /**
   * Get all tasks from TickTick Open API v1
   * Uses the task/getTaskList endpoint which returns tasks + projects
   */
  async getTasks(accessToken: string): Promise<TickTickTasksResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/task/getTaskList`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TickTick] Failed to fetch tasks:', response.status, errorText);
        throw new Error(`TickTick API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data as TickTickTasksResponse;
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
      projectName,
    };
  }
}