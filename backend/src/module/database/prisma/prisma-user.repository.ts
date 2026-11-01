import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IUserRepository, User, CreateUserDto } from '../interfaces/user-repository.interface';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string, includeAccounts?: boolean): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: includeAccounts ? { accounts: true } : undefined,
    });
    return user as User | null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user as User | null;
  }

  async create(data: CreateUserDto, accountData?: { provider: string; providerAccountId: string }): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
        accounts: accountData ? {
          create: {
            provider: accountData.provider,
            providerAccountId: accountData.providerAccountId,
          },
        } : undefined,
      },
    });
    return user as User;
  }

  async update(id: string, data: Partial<CreateUserDto>): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return user as User;
  }
}
