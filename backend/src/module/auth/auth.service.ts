import { Injectable, ConflictException, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
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
   * Mark an email as read in Gmail by removing its UNREAD label.
   * Used so that reading a message in Synchro syncs the read state back to Gmail.
   */
  async markGoogleEmailRead(userId: string, emailId: string) {
    // Frontend ids are prefixed with `gmail_`; the Gmail API wants the raw id
    const gmailId = emailId.replace(/^gmail_/, '');
    if (!gmailId) {
      throw new BadRequestException('Invalid email id');
    }

    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!account || (!account.accessToken && !account.refreshToken)) {
      throw new BadRequestException('No connected Google account');
    }

    let token = account.accessToken;
    if (!token && account.refreshToken) {
      token = await this.refreshGoogleToken(account);
    }
    if (!token) {
      throw new BadRequestException('No valid Google token');
    }

    const modify = async (accessToken: string) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}/modify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        },
      );

    let res = await modify(token);
    // Retry once with a refreshed token on 401
    if (res.status === 401 && account.refreshToken) {
      token = await this.refreshGoogleToken(account);
      if (!token) throw new BadRequestException('Failed to refresh Google token');
      res = await modify(token);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.warn(`Gmail modify failed (${res.status}):`, errorText);

      // Surface the common, actionable failures instead of a generic 400
      if (res.status === 403) {
        throw new ForbiddenException(
          'Google denied the request. The account is likely connected with the ' +
            'read-only Gmail scope — sign out and sign in with Google again to grant write access.',
        );
      }
      if (res.status === 401) {
        throw new UnauthorizedException('Google token expired or revoked. Please sign in again.');
      }
      if (res.status === 404) {
        throw new NotFoundException('Email not found in Gmail — it may have been deleted.');
      }
      throw new BadRequestException('Failed to mark email as read in Gmail');
    }

    return { success: true };
  }

  /**
   * Helper to parse full text/plain or text/html email body from Gmail payload.
   * Also processes inline images (cid: references) by embedding them as data URIs.
   */
  private async extractGmailBodyWithImages(
    payload: any,
    messageId: string,
    googleFetch: (url: string) => Promise<Response | null>,
  ): Promise<string> {
    if (!payload) return '';

    // Collect inline attachments (images with Content-ID)
    const inlineImages = new Map<string, string>();

    const collectInlineImages = async (part: any) => {
      if (part.body?.attachmentId && part.headers) {
        const contentIdHeader = part.headers.find((h: any) => h.name.toLowerCase() === 'content-id');
        if (contentIdHeader) {
          // Extract CID (remove < and >)
          const cid = contentIdHeader.value.replace(/^<|>$/g, '');
          const mimeType = part.mimeType || 'image/png';

          try {
            // Fetch the attachment data from Gmail API
            const attachmentRes = await googleFetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`,
            );

            if (attachmentRes) {
              const attachmentData = await attachmentRes.json() as any;
              if (attachmentData.data) {
                // Gmail returns base64url encoded data, convert to standard base64
                const base64Data = attachmentData.data.replace(/-/g, '+').replace(/_/g, '/');
                inlineImages.set(cid, `data:${mimeType};base64,${base64Data}`);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch inline image attachment ${part.body.attachmentId}:`, error);
          }
        }
      } else if (part.body?.data && part.headers) {
        // Inline image data is directly in the body
        const contentIdHeader = part.headers.find((h: any) => h.name.toLowerCase() === 'content-id');
        if (contentIdHeader) {
          const cid = contentIdHeader.value.replace(/^<|>$/g, '');
          const mimeType = part.mimeType || 'image/png';
          const base64Data = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
          inlineImages.set(cid, `data:${mimeType};base64,${base64Data}`);
        }
      }

      // Recursively search nested parts
      if (part.parts && Array.isArray(part.parts)) {
        for (const subPart of part.parts) {
          await collectInlineImages(subPart);
        }
      }
    };

    await collectInlineImages(payload);

    // Direct body data
    if (payload.body?.data) {
      let html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      // Replace CID references with data URIs
      inlineImages.forEach((dataUri, cid) => {
        html = html.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), dataUri);
      });
      return html;
    }

    // Multipart body parts - prefer HTML over plain text
    if (payload.parts && Array.isArray(payload.parts)) {
      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        let html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        // Replace CID references with data URIs
        inlineImages.forEach((dataUri, cid) => {
          html = html.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), dataUri);
        });
        return html;
      }

      const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (plainPart?.body?.data) {
        const text = Buffer.from(plainPart.body.data, 'base64url').toString('utf-8');
        // Convert plain text to HTML paragraphs
        return text.split('\n').map(line => `<p>${line}</p>`).join('');
      }

      // Recursively search nested multipart structures
      for (const part of payload.parts) {
        if (part.mimeType && part.mimeType.startsWith('multipart/')) {
          const nested = await this.extractGmailBodyWithImages(part, messageId, googleFetch);
          if (nested) {
            let html = nested;
            // Replace CID references with data URIs
            inlineImages.forEach((dataUri, cid) => {
              html = html.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), dataUri);
            });
            return html;
          }
        }
      }
    }

    return '';
  }

  /**
   * Helper to parse full text/plain or text/html email body from Gmail payload.
   * Synchronous version for backward compatibility.
   */
  private extractGmailBody(payload: any): string {
    if (!payload) return '';

    // Direct body data
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart body parts - prefer HTML over plain text
    if (payload.parts && Array.isArray(payload.parts)) {
      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        return html;
      }

      const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (plainPart?.body?.data) {
        const text = Buffer.from(plainPart.body.data, 'base64url').toString('utf-8');
        return text.split('\n').map(line => `<p>${line}</p>`).join('');
      }

      // Recursively search nested multipart structures
      for (const part of payload.parts) {
        if (part.mimeType && part.mimeType.startsWith('multipart/')) {
          const nested = this.extractGmailBody(part);
          if (nested) return nested;
        }
      }
    }

    return '';
  }

  /**
   * Fetch emails from the authenticated user's Google account via Gmail REST API.
   * Gmail list results use cursor-based pagination (pageToken), so we walk the
   * list pages until we reach the requested page number, then fetch details
   * only for that page's messages.
   * `search` (optional) runs server-side via Gmail's native `subject:` query
   * operator, so results are searched across the whole mailbox, not just the
   * currently loaded page.
   * Includes rate limiting to stay under Google API quotas.
   */
  async getGoogleEmails(userId: string, limit = 10, page = 1, search?: string) {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!account || (!account.accessToken && !account.refreshToken)) {
      return { emails: [], totalPages: 0, page: 1 };
    }

    let token = account.accessToken;
    if (!token && account.refreshToken) {
      token = await this.refreshGoogleToken(account);
    }

    if (!token) return { emails: [], totalPages: 0, page: 1 };

    try {
      const fetchLimit = Math.min(Math.max(limit, 1), 50);
      const targetPage = Math.max(page, 1);

      // Initial delay for rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));

      // Restrict to the Primary inbox tab, excluding Social and Promotions.
      // Let Google's account security/sign-in alerts through even when Gmail
      // sorts them into Updates.
      const baseQuery = 'in:inbox -category:promotions -category:social {-category:updates from:no-reply@accounts.google.com from:account-security-noreply@google.com}';

      // Server-side subject search using Gmail's native `subject:` operator
      // (case-insensitive, quoted phrase). Escape backslashes/quotes first.
      // The primary-inbox filter is always applied alongside the search.
      const qParam = search
        ? `subject:"${search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" ${baseQuery}`
        : baseQuery;

      const listUrlFor = (pageToken?: string) => {
        const params = new URLSearchParams({ maxResults: String(fetchLimit) });
        if (pageToken) params.set('pageToken', pageToken);
        if (qParam) params.set('q', qParam);
        return `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`;
      };

      // Fetch helper: retries once with a refreshed token on 401
      const googleFetch = async (url: string) => {
        let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401 && account.refreshToken) {
          token = await this.refreshGoogleToken(account);
          if (!token) return null;
          res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        }
        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          console.warn(`Gmail API request failed (${res.status}):`, errorText);
          return null;
        }
        return res;
      };

      // Walk Gmail's pageToken cursor until the requested page
      let listRes = await googleFetch(listUrlFor());
      if (!listRes) return { emails: [], totalPages: 0, page: 1 };

      let listData = (await listRes.json()) as {
        messages?: { id: string }[];
        resultSizeEstimate?: number;
        nextPageToken?: string;
      };

      let currentPage = 1;
      while (currentPage < targetPage && listData?.nextPageToken && listData.messages?.length) {
        // Brief pause between list requests to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 150));
        const res = await googleFetch(listUrlFor(listData.nextPageToken));
        if (!res) break;
        listData = (await res.json()) as typeof listData;
        currentPage++;
      }

      const messages = listData?.messages || [];
      if (messages.length === 0) {
        // Requested page is past the end of the mailbox
        return { emails: [], totalPages: 1, page: targetPage };
      }

      const totalPages = Math.max(
        1,
        Math.ceil((listData.resultSizeEstimate || messages.length) / fetchLimit),
      );

      // Fetch message details in parallel batches to reduce wall time
      const emails: any[] = [];
      const BATCH_SIZE = 10;

      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (msg) => {
            try {
              const detailRes = await googleFetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              );
              if (!detailRes) return null;

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

              // Extract full HTML body with inline images or fallback to plain text
              const emailBody = await this.extractGmailBodyWithImages(data.payload, msg.id, googleFetch) || data.snippet || '(No preview available)';

              return {
                id: `gmail_${data.id}`,
                subject: getHeader('Subject') || '(No Subject)',
                sender: senderEmail,
                senderName: senderName || senderEmail,
                to: getHeader('To') || 'me',
                account: account.providerAccountId || 'google',
                body: emailBody,
                folder: 'inbox',
                date: formattedDate,
                isRead: !data.labelIds?.includes('UNREAD'),
                isStarred: data.labelIds?.includes('STARRED') || false,
                attachments: [],
                replies: [],
              };
            } catch (error) {
              console.warn('Failed to fetch email details:', error);
              return null;
            }
          }),
        );
        emails.push(...results.filter((e) => e !== null));
        // Brief pause between detail batches to avoid rate limits
        if (i + BATCH_SIZE < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        emails,
        totalPages,
        page: targetPage,
      };
    } catch (error) {
      console.error('Error fetching Google emails:', error);
      return { emails: [], totalPages: 0, page: 1 };
    }
  }

}
