import type { WASocket } from '@whiskeysockets/baileys';
import { prisma } from '../lib/prisma.js';
import { resolveDisplayName } from '../whatsapp/nameResolver.js';
import { avatarQueue } from './avatarQueue.js';
import { getIO } from '../lib/io.js';

export interface GroupParticipantInfo {
  jid: string;
  role: 'participant' | 'admin' | 'superadmin';
  name: string;
  profilePictureUrl: string | null;
  phoneNumber: string | null;
}

export interface GroupDetailsResponse {
  group: {
    id: string;
    sessionId: string;
    jid: string;
    subject: string;
    description: string | null;
    ownerJid: string | null;
    groupCreatedAt: Date | null;
    announceOnly: boolean;
    restrict: boolean;
    pictureUrl: string | null;
    isCurrentUserAdmin: boolean;
    participantCount: number;
    updatedAt: Date;
  };
  participants: GroupParticipantInfo[];
}

export class GroupService {
  private socketProvider: ((sessionId: string) => WASocket | undefined) | null = null;

  public setSocketProvider(fn: (sessionId: string) => WASocket | undefined) {
    this.socketProvider = fn;
  }

  /**
   * Sync group metadata and participants from WhatsApp to PostgreSQL.
   */
  public async syncGroupMetadata(sessionId: string, groupJid: string): Promise<GroupDetailsResponse | null> {
    const sock = this.socketProvider ? this.socketProvider(sessionId) : undefined;
    if (!sock) {
      console.warn(`[GroupService] Socket not available for session ${sessionId} to sync ${groupJid}`);
      return this.getGroupDetails(sessionId, groupJid);
    }

    try {
      const metadata = await sock.groupMetadata(groupJid);
      if (!metadata) return null;

      // 1. Upsert Group record
      const group = await prisma.group.upsert({
        where: { sessionId_jid: { sessionId, jid: groupJid } },
        create: {
          sessionId,
          jid: groupJid,
          subject: metadata.subject || 'Group',
          description: metadata.desc || null,
          ownerJid: metadata.owner || null,
          groupCreatedAt: metadata.creation ? new Date(metadata.creation * 1000) : null,
          announceOnly: !!metadata.announce,
          restrict: !!metadata.restrict,
        },
        update: {
          subject: metadata.subject || 'Group',
          description: metadata.desc || null,
          ownerJid: metadata.owner || undefined,
          announceOnly: !!metadata.announce,
          restrict: !!metadata.restrict,
        },
      });

      // 2. Also keep Chat table subject in sync
      await prisma.chat.upsert({
        where: { sessionId_jid: { sessionId, jid: groupJid } },
        create: {
          sessionId,
          jid: groupJid,
          type: 'group',
          name: metadata.subject || 'Group',
        },
        update: {
          name: metadata.subject || 'Group',
        },
      });

      // 3. Sync participants
      if (metadata.participants && Array.isArray(metadata.participants)) {
        // Collect existing participants to reconcile
        const currentJids = metadata.participants.map((p) => p.id);

        // Delete members who are no longer in the group
        await prisma.groupParticipant.deleteMany({
          where: {
            sessionId,
            groupJid,
            participantJid: { notIn: currentJids },
          },
        });

        // Upsert active participants
        for (const p of metadata.participants) {
          const role = p.admin === 'admin' ? 'admin' : p.admin === 'superadmin' ? 'superadmin' : 'participant';
          await prisma.groupParticipant.upsert({
            where: {
              sessionId_groupJid_participantJid: {
                sessionId,
                groupJid,
                participantJid: p.id,
              },
            },
            create: {
              sessionId,
              groupJid,
              participantJid: p.id,
              role,
            },
            update: {
              role,
            },
          });
        }
      }

      // 4. Lazy-fetch group avatar
      avatarQueue.shouldFetchAvatar(sessionId, groupJid).then((needed) => {
        if (needed) avatarQueue.enqueue(sessionId, groupJid, 'preview');
      }).catch(() => {});

      // 5. Emit group.updated and group.participants.updated
      const io = getIO();
      if (io) {
        io.emit('group.updated', {
          sessionId,
          group: {
            jid: groupJid,
            subject: group.subject,
            description: group.description,
            announceOnly: group.announceOnly,
            restrict: group.restrict,
          },
        });
        io.emit('group.participants.updated', {
          sessionId,
          groupJid,
          participantCount: metadata.participants?.length || 0,
        });
      }

      return this.getGroupDetails(sessionId, groupJid);
    } catch (err) {
      console.warn(`[GroupService:${sessionId}] Failed to fetch metadata for ${groupJid}:`, err);
      return this.getGroupDetails(sessionId, groupJid);
    }
  }

  /**
   * Retrieve group details and participants from DB.
   */
  public async getGroupDetails(sessionId: string, groupJid: string): Promise<GroupDetailsResponse | null> {
    const group = await prisma.group.findUnique({
      where: { sessionId_jid: { sessionId, jid: groupJid } },
    });

    // If group record does not exist yet, check Chat table fallback
    const chat = await prisma.chat.findUnique({
      where: { sessionId_jid: { sessionId, jid: groupJid } },
    });

    if (!group && !chat) {
      return null;
    }

    const participants = await prisma.groupParticipant.findMany({
      where: { sessionId, groupJid },
      orderBy: [
        { role: 'asc' }, // superadmin/admin first
        { createdAt: 'asc' },
      ],
    });

    const participantJids = participants.map((p) => p.participantJid);
    const contacts = await prisma.contact.findMany({
      where: {
        sessionId,
        jid: { in: participantJids },
      },
    });

    const contactMap = new Map(contacts.map((c) => [c.jid, c]));

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { phoneNumber: true },
    });

    let isCurrentUserAdmin = false;

    const enrichedParticipants: GroupParticipantInfo[] = participants.map((p) => {
      const c = contactMap.get(p.participantJid);
      const name = resolveDisplayName({
        savedName: c?.savedName || c?.name,
        verifiedName: c?.verifiedName,
        pushName: c?.pushName,
        phoneNumber: c?.phoneNumber,
        jid: p.participantJid,
      });

      const profilePictureUrl =
        c?.profilePictureStatus === 'ok'
          ? `/api/avatars/${sessionId}/${encodeURIComponent(p.participantJid)}`
          : null;

      const isAdmin = p.role === 'admin' || p.role === 'superadmin';

      if (session?.phoneNumber) {
        const cleanSessionPhone = session.phoneNumber.replace(/\D/g, '');
        const pPhone = p.participantJid.split('@')[0].replace(/\D/g, '');
        if (cleanSessionPhone && pPhone && cleanSessionPhone === pPhone && isAdmin) {
          isCurrentUserAdmin = true;
        }
      }

      return {
        jid: p.participantJid,
        role: (p.role as 'participant' | 'admin' | 'superadmin') || 'participant',
        name,
        profilePictureUrl,
        phoneNumber: c?.phoneNumber || (p.participantJid.includes('@s.whatsapp.net') ? p.participantJid.split('@')[0] : null),
      };
    });

    const groupSubject = group?.subject || chat?.name || 'Group';
    const groupContact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid: groupJid } },
    });

    const pictureUrl =
      groupContact?.profilePictureStatus === 'ok'
        ? `/api/avatars/${sessionId}/${encodeURIComponent(groupJid)}`
        : null;

    return {
      group: {
        id: group?.id || chat?.id || groupJid,
        sessionId,
        jid: groupJid,
        subject: groupSubject,
        description: group?.description || null,
        ownerJid: group?.ownerJid || null,
        groupCreatedAt: group?.groupCreatedAt || null,
        announceOnly: group?.announceOnly ?? false,
        restrict: group?.restrict ?? false,
        pictureUrl,
        isCurrentUserAdmin,
        participantCount: enrichedParticipants.length,
        updatedAt: group?.updatedAt || chat?.updatedAt || new Date(),
      },
      participants: enrichedParticipants,
    };
  }

  /**
   * Check whether sending a message is permitted under announceOnly rules.
   */
  public async canSendToGroup(sessionId: string, groupJid: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!groupJid.endsWith('@g.us')) {
      return { allowed: true };
    }

    const details = await this.getGroupDetails(sessionId, groupJid);
    if (!details) {
      // Group unknown locally; allow sending and let WhatsApp server reject if needed
      return { allowed: true };
    }

    if (details.group.announceOnly && !details.group.isCurrentUserAdmin) {
      return {
        allowed: false,
        reason: 'Only community admins can send messages to this group.',
      };
    }

    return { allowed: true };
  }
}

export const groupService = new GroupService();
