import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
  SignalKeyStore,
  BufferJSON,
  initAuthCreds,
  addTransactionCapability,
} from '@whiskeysockets/baileys';
import type { Logger } from 'pino';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/crypto.js';

/**
 * Custom PostgreSQL Database Auth State for Baileys.
 * Serializes data with BufferJSON and encrypts all values using AES-256-GCM.
 */
export async function usePrismaAuthState(
  sessionId: string,
  logger: Logger,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // 1. Fetch or initialize session record
  let session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    session = await prisma.session.create({
      data: {
        id: sessionId,
        name: `Session ${sessionId.slice(0, 8)}`,
        status: 'idle',
      },
    });
  }

  // 2. Load and decrypt stored creds, or initialize fresh creds
  let creds: AuthenticationCreds;
  if (session.encryptedCreds) {
    try {
      const decrypted = decrypt(session.encryptedCreds);
      creds = JSON.parse(decrypted, BufferJSON.reviver);
    } catch (err) {
      logger.error({ err }, 'Failed to decrypt session creds; re-initializing fresh credentials');
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  // 3. Implement SignalKeyStore for storing signal pre-keys, session keys, etc.
  const keys: SignalKeyStore = {
    get: async (type, ids) => {
      const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};

      const rows = await prisma.authKey.findMany({
        where: {
          sessionId,
          type,
          keyId: { in: ids },
        },
      });

      for (const row of rows) {
        try {
          const decrypted = decrypt(row.encryptedValue);
          const parsed = JSON.parse(decrypted, BufferJSON.reviver);
          data[row.keyId] = parsed;
        } catch (err) {
          logger.error({ err, type, keyId: row.keyId }, 'Failed to decrypt auth key from database');
        }
      }

      return data;
    },

    set: async (data: SignalDataSet) => {
      const tasks: Promise<unknown>[] = [];

      for (const category of Object.keys(data)) {
        const type = category as keyof SignalDataTypeMap;
        const subData = data[type];
        if (!subData) continue;

        for (const id of Object.keys(subData)) {
          const value = subData[id];
          if (value === null || value === undefined) {
            tasks.push(
              prisma.authKey.deleteMany({
                where: {
                  sessionId,
                  type,
                  keyId: id,
                },
              }),
            );
          } else {
            const serialized = JSON.stringify(value, BufferJSON.replacer);
            const encryptedValue = encrypt(serialized);

            tasks.push(
              prisma.authKey.upsert({
                where: {
                  sessionId_type_keyId: {
                    sessionId,
                    type,
                    keyId: id,
                  },
                },
                create: {
                  sessionId,
                  type,
                  keyId: id,
                  encryptedValue,
                },
                update: {
                  encryptedValue,
                },
              }),
            );
          }
        }
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
  };

  // 4. Save creds function
  const saveCreds = async () => {
    const serialized = JSON.stringify(creds, BufferJSON.replacer);
    const encryptedCreds = encrypt(serialized);

    await prisma.session.update({
      where: { id: sessionId },
      data: { encryptedCreds },
    });
  };

  return {
    state: {
      creds,
      keys: addTransactionCapability(keys, logger, { maxCommitRetries: 5, delayBetweenTriesMs: 500 }),
    },
    saveCreds,
  };
}
