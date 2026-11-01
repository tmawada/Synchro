export interface User {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
  accounts?: any[]; // We'll use any[] here to avoid circular dependencies in interfaces
}

export interface CreateUserDto {
  email: string;
  name?: string | null;
  password?: string | null;
  avatarUrl?: string | null;
}

export interface IUserRepository {
  findById(id: string, includeAccounts?: boolean): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserDto, accountData?: { provider: string; providerAccountId: string }): Promise<User>;
  update(id: string, data: Partial<CreateUserDto>): Promise<User>;
}
