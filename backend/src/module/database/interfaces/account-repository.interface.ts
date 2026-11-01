import { User } from './user-repository.interface';

export interface Account {
  id: string;
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiry?: Date | null;
  ticktickId?: string | null;
  ticktickAccessToken?: string | null;
  ticktickRefreshToken?: string | null;
  ticktickTokenExpiry?: Date | null;
  userId: string;
  user?: User;
}

export type AccountWithUser = Account & { user: User };

export interface CreateAccountDto {
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  ticktickAccessToken?: string | null;
  ticktickRefreshToken?: string | null;
  ticktickId?: string | null;
  userId: string;
}

export interface UpdateAccountDto {
  accessToken?: string | null;
  refreshToken?: string | null;
  ticktickId?: string | null;
  ticktickAccessToken?: string | null;
  ticktickRefreshToken?: string | null;
  ticktickTokenExpiry?: Date | null;
}

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByProviderAccountId(provider: string, providerAccountId: string, includeUser?: boolean): Promise<Account | null>;
  findByUserIdAndProvider(userId: string, provider: string): Promise<Account | null>;
  create(data: CreateAccountDto): Promise<Account>;
  update(id: string, data: UpdateAccountDto): Promise<Account>;
  delete(id: string): Promise<void>;
}
