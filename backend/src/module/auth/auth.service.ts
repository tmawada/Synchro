import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register a new user with email + password.
   * Creates both User and Account(provider="email") records.
   */
  async register(email: string, password: string, name?: string) {
    // Check if a user with this email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // If user exists and already has an email provider, reject
      const emailAccount = await this.prisma.account.findFirst({
        where: { userId: existingUser.id, provider: 'email' },
      });
      if (emailAccount) {
        throw new ConflictException('An account with this email already exists.');
      }

      // User exists (e.g., from Google OAuth) but no email provider — link it
      const hashedPassword = await bcrypt.hash(password, 12);
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password: hashedPassword,
          name: name || existingUser.name,
        },
      });
      await this.prisma.account.create({
        data: {
          provider: 'email',
          providerAccountId: email.toLowerCase(),
          userId: existingUser.id,
        },
      });

      return this.issueJwt(existingUser);
    }

    // New user — create from scratch
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        password: hashedPassword,
        accounts: {
          create: {
            provider: 'email',
            providerAccountId: email.toLowerCase(),
          },
        },
      },
    });

    return this.issueJwt(user);
  }

  /**
   * Validate email/password credentials for login.
   */
  async validateEmailLogin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException(
        'Invalid credentials. If you signed up with Google, use Google Sign-In.',
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueJwt(user);
  }

  /**
   * Handle Google OAuth callback.
   * Implements auto-link: if user with same email exists, link Google provider.
   */
  async handleGoogleOAuth(profile: GoogleProfile) {
    const { googleId, email, name, avatarUrl, accessToken, refreshToken } = profile;

    // 1. Check if this Google account is already linked
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      // Update tokens if provided
      if (accessToken || refreshToken) {
        await this.prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: accessToken || existingAccount.accessToken,
            refreshToken: refreshToken || existingAccount.refreshToken,
          },
        });
      }
      return this.issueJwt(existingAccount.user);
    }

    // 2. Check if a user with the same email already exists (auto-link)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Link Google provider to existing user
      await this.prisma.account.create({
        data: {
          provider: 'google',
          providerAccountId: googleId,
          accessToken,
          refreshToken,
          userId: existingUser.id,
        },
      });

      // Update avatar if not set
      if (!existingUser.avatarUrl && avatarUrl) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { avatarUrl },
        });
      }

      return this.issueJwt(existingUser);
    }

    // 3. Brand new user — create User + Account
    const newUser = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        avatarUrl,
        accounts: {
          create: {
            provider: 'google',
            providerAccountId: googleId,
            accessToken,
            refreshToken,
          },
        },
      },
    });

    return this.issueJwt(newUser);
  }

  /**
   * Get user profile by ID.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Strip password from response
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Issue a JWT token for the given user.
   */
  issueJwt(user: { id: string; email: string; name?: string | null }) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
