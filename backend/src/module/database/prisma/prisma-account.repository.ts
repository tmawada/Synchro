import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAccountRepository, AccountWithUser } from '../interfaces/account-repository.interface';

@Injectable()
export class PrismaAccountRepository implements IAccountRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<AccountWithUser | null> {
    return this.prisma.account.findUnique({
      where: { id },
      include: { user: true },
    }) as Promise<AccountWithUser | null>;
  }

  async findByProviderAccountId(provider: string, providerAccountId: string): Promise<AccountWithUser | null> {
    return this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: { user: true },
    }) as Promise<AccountWithUser | null>;
  }

  async findByUserIdAndProvider(userId: string, provider: string) {
    return this.prisma.account.findFirst({
      where: { userId, provider },
    });
  }

  async create(data: any) {
    return this.prisma.account.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.account.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.account.delete({
      where: { id },
    });
  }
}
