import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { Request } from 'express';
import { TickTickService } from './ticktick.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ticktick')
@UseGuards(JwtAuthGuard)
export class TickTickController {
  constructor(private tickTickService: TickTickService) {}

  /**
   * GET /ticktick/tasks
   * Get ALL tasks (active + inbox + completed) in Synchro format.
   * Cache-Control: no-store — prevents the browser from revalidating with
   * If-None-Match and getting an empty 304 (which the frontend treats as
   * a failed fetch because 304 is not in the 2xx range).
   */
  @Get('tasks')
  @Header('Cache-Control', 'no-store')
  async getTasks(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      return { tasks: [], projects: [], connected: false };
    }

    const response = await this.tickTickService.getTasks(accessToken);
    return {
      tasks: response.tasks.map((task) =>
        this.tickTickService.convertToSynchroTask(task, response.projects),
      ),
      projects: response.projects,
      connected: true,
    };
  }

  /**
   * GET /ticktick/inbox
   * Get ONLY the inbox tasks (active) in Synchro format.
   */
  @Get('inbox')
  @Header('Cache-Control', 'no-store')
  async getInboxTasks(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      return { tasks: [], projects: [], connected: false };
    }

    const response = await this.tickTickService.getInboxTasks(accessToken);
    return {
      tasks: response.tasks.map((task) =>
        this.tickTickService.convertToSynchroTask(task, response.projects),
      ),
      projects: response.projects,
      connected: true,
    };
  }

  /**
   * GET /ticktick/completed
   * Get ONLY completed tasks (last 90 days, all projects) in Synchro format.
   */
  @Get('completed')
  @Header('Cache-Control', 'no-store')
  async getCompletedTasks(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      return { tasks: [], projects: [], connected: false };
    }

    const response = await this.tickTickService.getCompletedOnly(accessToken);
    return {
      tasks: response.tasks.map((task) =>
        this.tickTickService.convertToSynchroTask(task, response.projects),
      ),
      projects: response.projects,
      connected: true,
    };
  }

  /**
   * GET /ticktick/status
   * Check if TickTick is connected for the current user.
   */
  @Get('status')
  async status(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const connected = await this.tickTickService.isConnected(userId);
    return { connected };
  }

  /**
   * POST /ticktick/connect
   * Connect TickTick account by providing access token.
   * Accepts API key or OAuth access token.
   */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(@Req() req: Request, @Body() body: { accessToken: string; refreshToken?: string; ticktickId?: string }) {
    const userId = (req.user as { id: string }).id;
    const { accessToken, refreshToken, ticktickId } = body;
    if (!accessToken) {
      throw new BadRequestException('Access token is required');
    }
    return this.tickTickService.setTickTickToken(userId, accessToken, refreshToken, ticktickId);
  }

  /**
   * POST /ticktick/disconnect
   * Disconnect TickTick account (remove stored tokens).
   */
  @Post('disconnect')
  async disconnect(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.tickTickService.disconnectTickTick(userId);
  }

  /**
   * POST /ticktick/tasks
   * Create a task in the user's TickTick account.
   * Body: { title, projectId?, priority? (0=none,1=low,3=medium,5=high), dueDate? ('YYYY-MM-DD'), content? }
   * Returns the created task converted to Synchro format.
   */
  @Post('tasks')
  @HttpCode(HttpStatus.OK)
  async createTask(
    @Req() req: Request,
    @Body() body: { title: string; projectId?: string; priority?: number; dueDate?: string; content?: string },
  ) {
    if (!body.title || !body.title.trim()) {
      throw new BadRequestException('Task title is required');
    }
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      throw new BadRequestException('TickTick is not connected.');
    }

    const created = await this.tickTickService.createTask(accessToken, {
      ...body,
      title: body.title.trim(),
    });
    const projects = await this.tickTickService.getProjects(accessToken);

    return {
      success: true,
      task: this.tickTickService.convertToSynchroTask(created, projects),
    };
  }

  /**
   * POST /ticktick/task/:taskId?projectId=...
   * Update a TickTick task (title/priority/dueDate) or mark it complete/incomplete.
   * Body: { title?, priority? (0=none,1=low,3=medium,5=high), dueDate? ('YYYY-MM-DD'), completed? }
   */
  @Post('task/:taskId')
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Query('projectId') projectId: string,
    @Body() body: { title?: string; priority?: number; dueDate?: string | null; completed?: boolean },
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      throw new BadRequestException('TickTick is not connected.');
    }

    if (body.completed === true) {
      await this.tickTickService.completeTask(accessToken, projectId, taskId);
      return { success: true };
    }
    if (body.completed === false) {
      // Move a completed task back to the active list
      await this.tickTickService.uncompleteTask(accessToken, projectId, taskId);
      return { success: true };
    }

    const patch: { title?: string; priority?: number; dueDate?: string | null } = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.priority !== undefined) patch.priority = body.priority;
    // An empty/null due date clears the date on TickTick
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;

    if (Object.keys(patch).length > 0) {
      await this.tickTickService.updateTask(accessToken, projectId, taskId, patch);
    }

    return { success: true };
  }

  /**
   * DELETE /ticktick/task/:taskId?projectId=...
   * Delete a TickTick task.
   */
  @Delete('task/:taskId')
  async deleteTask(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Query('projectId') projectId: string,
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    const userId = (req.user as { id: string }).id;
    const accessToken = await this.tickTickService.getAccessToken(userId);
    if (!accessToken) {
      throw new BadRequestException('TickTick is not connected.');
    }

    await this.tickTickService.deleteTask(accessToken, projectId, taskId);
    return { success: true };
  }
}
