import { Injectable } from '@nestjs/common';
import { FirestoreService } from './firestore.service';
import { IUserRepository, User, CreateUserDto } from '../interfaces/user-repository.interface';

@Injectable()
export class FirestoreUserRepository implements IUserRepository {
  constructor(private firestoreService: FirestoreService) {}

  private get collection() {
    return this.firestoreService.db.collection('users');
  }

  async findById(id: string, includeAccounts = false): Promise<User | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const user = { id: doc.id, ...data } as User;

    if (includeAccounts) {
      const accountsSnapshot = await this.firestoreService.db.collection('accounts').where('userId', '==', id).get();
      user.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const snapshot = await this.collection.where('email', '==', email.toLowerCase()).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as User;
  }

  async create(data: CreateUserDto, accountData?: { provider: string; providerAccountId: string }): Promise<User> {
    return await this.firestoreService.db.runTransaction(async (transaction) => {
      const userRef = this.collection.doc();
      const userData = {
        email: data.email.toLowerCase(),
        name: data.name || null,
        avatarUrl: data.avatarUrl || null,
        password: data.password || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      transaction.set(userRef, userData);

      if (accountData) {
        const accountRef = this.firestoreService.db.collection('accounts').doc(`${accountData.provider}:${accountData.providerAccountId}`);
        transaction.set(accountRef, {
          provider: accountData.provider,
          providerAccountId: accountData.providerAccountId,
          userId: userRef.id
        });
      }

      return { id: userRef.id, ...userData } as User;
    });
  }

  async update(id: string, data: Partial<CreateUserDto>): Promise<User> {
    await this.collection.doc(id).update({ ...data, updatedAt: new Date() });
    const user = await this.findById(id);
    if (!user) throw new Error('User not found after update');
    return user;
  }
}
