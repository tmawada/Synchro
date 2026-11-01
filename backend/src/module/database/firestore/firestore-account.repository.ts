import { Injectable } from '@nestjs/common';
import { FirestoreService } from './firestore.service';
import { IAccountRepository, Account, AccountWithUser, CreateAccountDto, UpdateAccountDto } from '../interfaces/account-repository.interface';

@Injectable()
export class FirestoreAccountRepository implements IAccountRepository {
  constructor(private firestoreService: FirestoreService) {}

  private get collection() {
    return this.firestoreService.db.collection('accounts');
  }

  async findById(id: string): Promise<Account | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Account;
  }

  async findByProviderAccountId(provider: string, providerAccountId: string, includeUser = false): Promise<AccountWithUser | null> {
    const doc = await this.collection.doc(`${provider}:${providerAccountId}`).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const account = { id: doc.id, ...data } as Account;

    if (includeUser && data?.userId) {
      const userDoc = await this.firestoreService.db.collection('users').doc(data.userId).get();
      if (userDoc.exists) {
        account.user = { id: userDoc.id, ...userDoc.data() } as any;
      }
    }
    return account as AccountWithUser;
  }

  async findByUserIdAndProvider(userId: string, provider: string): Promise<Account | null> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('provider', '==', provider)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Account;
  }

  async create(data: CreateAccountDto): Promise<Account> {
    const ref = this.collection.doc(`${data.provider}:${data.providerAccountId}`);
    await ref.set({
      ...data,
      tokenExpiry: data.accessToken ? null : undefined, // Placeholder if needed
    });
    return { id: ref.id, ...data } as Account;
  }

  async update(id: string, data: UpdateAccountDto): Promise<Account> {
    await this.collection.doc(id).update(data as any);
    const doc = await this.collection.doc(id).get();
    return { id: doc.id, ...doc.data() } as Account;
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }
}
