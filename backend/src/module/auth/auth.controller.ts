import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Param,
  Delete,
  Header,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request, Response } from 'express';
// import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) { }

  /**
   * POST /auth/register
   * Register a new user with email + password.
   */
  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name?: string },
  ) {
    return this.authService.register(body.email, body.password, body.name);
  }

  /**
   * POST /auth/login
   * Login with email + password.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.validateEmailLogin(body.email, body.password);
  }

  /**
   * GET /auth/google
   * Initiate Google OAuth flow — redirects to Google consent screen.
   */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Guard handles the redirect
  }

  /**
   * GET /auth/google/callback
   * Google OAuth callback — receives the user profile, issues JWT,
   * and redirects to frontend with the token.
   */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { accessToken: string; user: { id: string; email: string; name: string } };
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

    // Redirect to frontend with the JWT token as a query param
    const redirectUrl = `${frontendUrl}/auth/callback?token=${user.accessToken}`;
    res.redirect(redirectUrl);
  }

  /**
   * GET /auth/me
   * Get the current authenticated user's profile (protected).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.authService.getProfile(user.id);
  }

  /**
   * GET /auth/emails
   * Get emails from user's connected Google account (protected).
   * Supports pagination with page and limit parameters.
   */
  @Get('emails')
  @UseGuards(JwtAuthGuard)
  async getEmails(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    const user = req.user as { id: string };
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.authService.getGoogleEmails(user.id, limitNum, pageNum);
  }

  /**
   * GET /auth/ticktick-tasks
   * Get tasks from user's connected TickTick account (protected).
   * Returns converted tasks in Synchro format.
   * Cache-Control: no-store — prevents the browser from revalidating with
   * If-None-Match and getting an empty 304 (which the frontend treats as
   * a failed fetch because 304 is not in the 2xx range).
   */
  @Get('ticktick-tasks')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async getTickTickTasks(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.authService.getTickTickTasks(user.id);
  }

  /**
   * POST /auth/ticktick/connect
   * Connect TickTick account by providing access token.
   * Accepts API key or OAuth access token.
   */
  @Post('ticktick/connect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async connectTickTick(@Req() req: Request, @Body() body: { accessToken: string; refreshToken?: string; ticktickId?: string }) {
    const user = req.user as { id: string };
    const { accessToken, refreshToken, ticktickId } = body;
    if (!accessToken) {
      throw new BadRequestException('Access token is required');
    }
    return this.authService.setTickTickToken(user.id, accessToken, refreshToken, ticktickId);
  }

  /**
   * POST /auth/ticktick/disconnect
   * Disconnect TickTick account (remove stored tokens).
   */
  @Post('ticktick/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectTickTick(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.authService.disconnectTickTick(user.id);
  }

  /**
   * POST /auth/ticktick/tasks
   * Create a task in the user's TickTick account (protected).
   * Body: { title, projectId?, priority? (0=none,1=low,3=medium,5=high), dueDate? ('YYYY-MM-DD'), content? }
   * Returns the created task converted to Synchro format.
   */
  @Post('ticktick/tasks')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createTickTickTask(
    @Req() req: Request,
    @Body() body: { title: string; projectId?: string; priority?: number; dueDate?: string; content?: string },
  ) {
    if (!body.title || !body.title.trim()) {
      throw new BadRequestException('Task title is required');
    }
    const user = req.user as { id: string };
    return this.authService.createTickTickTask(user.id, { ...body, title: body.title.trim() });
  }

  /**
   * POST /auth/ticktick/task/:taskId?projectId=...
   * Update a TickTick task (title/priority/dueDate) or mark it complete.
   * Body: { title?, priority? (0=none,1=low,3=medium,5=high), dueDate? ('YYYY-MM-DD'), completed? }
   */
  @Post('ticktick/task/:taskId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateTickTickTask(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Query('projectId') projectId: string,
    @Body() body: { title?: string; priority?: number; dueDate?: string; completed?: boolean },
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    const user = req.user as { id: string };
    return this.authService.updateTickTickTask(user.id, taskId, projectId, body);
  }

  /**
   * DELETE /auth/ticktick/task/:taskId?projectId=...
   * Delete a TickTick task.
   */
  @Delete('ticktick/task/:taskId')
  @UseGuards(JwtAuthGuard)
  async deleteTickTickTask(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Query('projectId') projectId: string,
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    const user = req.user as { id: string };
    return this.authService.deleteTickTickTask(user.id, taskId, projectId);
  }

  /**
   * GET /auth/ticktick/status
   * Check if TickTick is connected for the current user.
   */
  @Get('ticktick/status')
  @UseGuards(JwtAuthGuard)
  async tickTickStatus(@Req() req: Request) {
    const user = req.user as { id: string };
    const connected = await this.authService.isTickTickConnected(user.id);
    return { connected };
  }
}
