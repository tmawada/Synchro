import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
    private configService: ConfigService,
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

  private async refreshGoogleToken(account: { id: string; refreshToken: string | null }) {
    if (!account.refreshToken) {
      console.error(`[GoogleAuth] No refresh token available for account ${account.id}. User needs to re-authenticate with Google.`);
      return null;
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '');

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: account.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[GoogleAuth] Failed to refresh Google token:`, errorText);
        return null;
      }
      const data = (await res.json()) as { access_token?: string };
      if (data.access_token) {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { accessToken: data.access_token },
        });
        return data.access_token;
      }
    } catch (err) {
      console.error(`[GoogleAuth] Error refreshing Google token:`, err);
      return null;
    }
    return null;
  }

  /**
   * Helper to parse full text/plain or text/html email body from Gmail payload.
   */
  private extractGmailBody(payload: any): string {
    if (!payload) return '';

    // Direct body data
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart body parts
    if (payload.parts && Array.isArray(payload.parts)) {
      const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (plainPart?.body?.data) {
        return Buffer.from(plainPart.body.data, 'base64url').toString('utf-8');
      }

      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        return html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      for (const part of payload.parts) {
        const nested = this.extractGmailBody(part);
        if (nested) return nested;
      }
    }

    return '';
  }

  /**
   * Fetch emails from the authenticated user's Google account via Gmail REST API.
   * Supports fetching up to `maxResults` (default 100).
   */
  async getGoogleEmails(userId: string, limit = 500) {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!account || (!account.accessToken && !account.refreshToken)) {
      return [];
    }

    let token = account.accessToken;
    if (!token && account.refreshToken) {
      token = await this.refreshGoogleToken(account);
    }

    if (!token) return [];

    try {
      let allMessages: { id: string }[] = [];
      let pageToken = '';

      // Fetch message list (supports fetching up to `limit` messages)
      while (allMessages.length < limit) {
        const fetchCount = Math.min(100, limit - allMessages.length);
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${fetchCount}`;
        if (pageToken) {
          url += `&pageToken=${pageToken}`;
        }

        let listRes = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (listRes.status === 401) {
          token = await this.refreshGoogleToken(account);
          if (token) {
            listRes = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }

        if (!listRes.ok) {
          console.error('Failed to fetch Gmail list:', await listRes.text());
          break;
        }

        const listData = (await listRes.json()) as {
          messages?: { id: string }[];
          nextPageToken?: string;
        };

        if (listData.messages && listData.messages.length > 0) {
          allMessages.push(...listData.messages);
        }

        if (!listData.nextPageToken || allMessages.length >= limit) {
          break;
        }
        pageToken = listData.nextPageToken;
      }

      if (allMessages.length === 0) {
        return [];
      }

      const emails = await Promise.all(
        allMessages.map(async (msg) => {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (!detailRes.ok) return null;

          const data = (await detailRes.json()) as any;
          const headers = data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          const rawFrom = getHeader('From');
          let senderName = rawFrom;
          let senderEmail = rawFrom;
          if (rawFrom.includes('<')) {
            const parts = rawFrom.split('<');
            senderName = parts[0].trim().replace(/^"|"$/g, '');
            senderEmail = parts[1].replace('>', '').trim();
          }

          const dateHeader = getHeader('Date');
          let formattedDate = 'Recently';
          if (dateHeader) {
            try {
              const d = new Date(dateHeader);
              formattedDate = d.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
            } catch {}
          }

          const fullBody = this.extractGmailBody(data.payload) || data.snippet || '(No content)';

          return {
            id: `gmail_${data.id}`,
            subject: getHeader('Subject') || '(No Subject)',
            sender: senderEmail,
            senderName: senderName || senderEmail,
            to: getHeader('To') || 'me',
            account: account.providerAccountId || 'google',
            body: fullBody,
            folder: 'inbox',
            date: formattedDate,
            isRead: !data.labelIds?.includes('UNREAD'),
            isStarred: data.labelIds?.includes('STARRED') || false,
            attachments: [],
            replies: [],
          };
        }),
      );

      return emails.filter(Boolean);
    } catch (error) {
      console.error('Error fetching Google emails:', error);
      return [];
    }
  }
}
