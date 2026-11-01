import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

@Injectable()
export class FirestoreService implements OnModuleInit {
  private _firestore: Firestore;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const provider = this.configService.get<string>('DATABASE_PROVIDER');
    if (provider !== 'firebase') return;

    if (getApps().length === 0) {
      const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY_PATH');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

      let credential;

      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          credential = cert(serviceAccount);
        } catch (error) {
          console.error('[FirestoreService] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
          throw new Error('Invalid Firebase service account JSON');
        }
      } else if (serviceAccountPath) {
        credential = cert(serviceAccountPath);
      } else {
        throw new Error('No Firebase credentials provided');
      }

      initializeApp({
        credential,
        projectId,
      });

      console.log('[FirestoreService] Firebase initialized');
    }

    this._firestore = getFirestore();
  }

  get db(): Firestore {
    if (!this._firestore) {
      this._firestore = getFirestore();
    }
    return this._firestore;
  }
}
