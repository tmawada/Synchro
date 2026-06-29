import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
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
}
