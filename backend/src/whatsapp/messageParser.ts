import type { proto } from '@whiskeysockets/baileys';

export type ParsedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'system'
  | 'other';

export interface ParsedMessage {
  id: string;
  sessionId: string;
  chatJid: string;
  senderJid?: string | null;
  fromMe: boolean;
  pushName?: string | null;
  type: ParsedMessageType;
  text?: string | null;
  caption?: string | null;
  mediaMime?: string | null;
  mediaFileName?: string | null;
  mediaSize?: number | null;
  timestamp: Date;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyToMessageId?: string | null;
  isRevoke: boolean;
  targetRevokeId?: string | null;
  isEdit?: boolean;
  targetEditId?: string | null;
  isForwarded?: boolean;
  forwardScore?: number | null;
  mentionedJids?: string[] | null;
  raw?: Record<string, unknown> | null;
}

export function formatStubTypeNotice(stubType: number | string, params?: (string | null | undefined)[] | null): string {
  const typeStr = String(stubType).toUpperCase();
  const param = params && params.length ? String(params[0] || '') : '';
  const cleanParam = param.includes('@') ? param.split('@')[0] : param;

  if (typeStr.includes('GROUP_PARTICIPANT_ADD') || typeStr === '27') {
    return cleanParam ? `${cleanParam} was added to the group` : 'A participant was added to the group';
  }
  if (typeStr.includes('GROUP_PARTICIPANT_REMOVE') || typeStr === '28') {
    return cleanParam ? `${cleanParam} was removed from the group` : 'A participant was removed from the group';
  }
  if (typeStr.includes('GROUP_PARTICIPANT_LEAVE') || typeStr === '32') {
    return cleanParam ? `${cleanParam} left the group` : 'A participant left the group';
  }
  if (typeStr.includes('GROUP_PARTICIPANT_PROMOTE') || typeStr === '29') {
    return cleanParam ? `${cleanParam} is now an admin` : 'A participant was promoted to admin';
  }
  if (typeStr.includes('GROUP_PARTICIPANT_DEMOTE') || typeStr === '30') {
    return cleanParam ? `${cleanParam} is no longer an admin` : 'An admin was demoted';
  }
  if (typeStr.includes('GROUP_CHANGE_SUBJECT') || typeStr === '21') {
    return params && params.length && params[0] ? `Group subject changed to "${params[0]}"` : 'Group subject was changed';
  }
  if (typeStr.includes('GROUP_CHANGE_DESCRIPTION') || typeStr === '24') {
    return 'Group description was changed';
  }
  if (typeStr.includes('GROUP_CHANGE_ANNOUNCE') || typeStr === '26') {
    return 'Group settings changed: only admins can send messages';
  }
  if (typeStr.includes('GROUP_CREATE') || typeStr === '20') {
    return 'Group was created';
  }
  return 'System notice';
}

/**
 * Normalize timestamps across Baileys versions (seconds, milliseconds, Long).
 */
export function normalizeTimestamp(ts: unknown): Date {
  if (!ts) return new Date();

  let ms = 0;
  if (typeof ts === 'number') {
    ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  } else if (typeof ts === 'object' && ts !== null && 'low' in ts) {
    // protobuf Long
    const num = Number((ts as { toNumber?: () => number }).toNumber?.() ?? (ts as { low: number }).low);
    ms = num < 10_000_000_000 ? num * 1000 : num;
  } else if (typeof ts === 'string') {
    const num = Number(ts);
    if (!isNaN(num)) {
      ms = num < 10_000_000_000 ? num * 1000 : num;
    } else {
      const parsed = Date.parse(ts);
      ms = isNaN(parsed) ? Date.now() : parsed;
    }
  } else {
    ms = Date.now();
  }

  return new Date(ms);
}

/**
 * Map Baileys WAMessageStatus numeric/string to our application status.
 */
export function mapMessageStatus(status: unknown): 'pending' | 'sent' | 'delivered' | 'read' | 'failed' {
  if (typeof status === 'number') {
    switch (status) {
      case 1: // PENDING
        return 'pending';
      case 2: // SERVER_ACK
        return 'sent';
      case 3: // DELIVERY_ACK
        return 'delivered';
      case 4: // READ
      case 5: // PLAYED
        return 'read';
      case 0: // ERROR
      default:
        return 'delivered';
    }
  }

  const s = String(status).toUpperCase();
  if (s.includes('PENDING')) return 'pending';
  if (s.includes('SERVER')) return 'sent';
  if (s.includes('DELIVERY')) return 'delivered';
  if (s.includes('READ') || s.includes('PLAYED')) return 'read';
  if (s.includes('ERROR')) return 'failed';

  return 'delivered';
}

/**
 * Remove any binary buffers, keys, or sensitive fields before database storage.
 */
function sanitizeRawPayload(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null;

  try {
    return JSON.parse(
      JSON.stringify(obj, (key, value) => {
        if (
          key === 'mediaKey' ||
          key === 'mac' ||
          key === 'fileEncSha256' ||
          key === 'fileSha256' ||
          key === 'clientUrl' ||
          key === 'directPath'
        ) {
          return undefined;
        }
        if (value && typeof value === 'object' && value.type === 'Buffer') {
          return undefined;
        }
        return value;
      }),
    );
  } catch {
    return null;
  }
}

/**
 * Parse a raw Baileys WAMessage into a typed, sanitized ParsedMessage.
 */
export function parseWAMessage(msg: proto.IWebMessageInfo, sessionId: string): ParsedMessage | null {
  if (!msg.key || !msg.key.id || !msg.key.remoteJid) {
    return null;
  }

  const id = msg.key.id;
  const chatJid = msg.key.remoteJid;
  const fromMe = !!msg.key.fromMe;
  const senderJid = fromMe
    ? null
    : msg.key.participant || (msg as { participant?: string }).participant || chatJid;
  const timestamp = normalizeTimestamp(msg.messageTimestamp);
  const status = mapMessageStatus(msg.status);

  const m = msg.message;
  let type: ParsedMessageType = 'other';
  let text: string | null = null;
  let caption: string | null = null;
  let mediaMime: string | null = null;
  let mediaFileName: string | null = null;
  let mediaSize: number | null = null;
  let replyToMessageId: string | null = null;
  let isRevoke = false;
  let targetRevokeId: string | null = null;
  let isEdit = false;
  let targetEditId: string | null = null;
  let isForwarded = false;
  let forwardScore: number | null = null;
  let mentionedJids: string[] | null = null;

  if (m) {
    // Check contextInfo across message types for forwarding and mentions
    const contextInfo =
      m.extendedTextMessage?.contextInfo ||
      m.imageMessage?.contextInfo ||
      m.videoMessage?.contextInfo ||
      m.audioMessage?.contextInfo ||
      m.documentMessage?.contextInfo ||
      m.stickerMessage?.contextInfo;

    if (contextInfo) {
      if (contextInfo.isForwarded) {
        isForwarded = true;
        forwardScore = contextInfo.forwardingScore || 1;
      }
      if (contextInfo.mentionedJid && Array.isArray(contextInfo.mentionedJid) && contextInfo.mentionedJid.length > 0) {
        mentionedJids = contextInfo.mentionedJid;
      }
    }

    // 1. Text / Conversation
    if (m.conversation) {
      type = 'text';
      text = m.conversation;
    } else if (m.extendedTextMessage) {
      type = 'text';
      text = m.extendedTextMessage.text || null;
      replyToMessageId = m.extendedTextMessage.contextInfo?.stanzaId || null;
    }
    // 2. Images
    else if (m.imageMessage) {
      type = 'image';
      caption = m.imageMessage.caption || null;
      mediaMime = m.imageMessage.mimetype || 'image/jpeg';
      mediaSize = m.imageMessage.fileLength ? Number(m.imageMessage.fileLength) : null;
      replyToMessageId = m.imageMessage.contextInfo?.stanzaId || null;
    }
    // 3. Videos
    else if (m.videoMessage) {
      type = 'video';
      caption = m.videoMessage.caption || null;
      mediaMime = m.videoMessage.mimetype || 'video/mp4';
      mediaSize = m.videoMessage.fileLength ? Number(m.videoMessage.fileLength) : null;
      replyToMessageId = m.videoMessage.contextInfo?.stanzaId || null;
    }
    // 4. Audio & Voice Notes
    else if (m.audioMessage) {
      type = 'audio';
      mediaMime = m.audioMessage.mimetype || 'audio/ogg';
      mediaSize = m.audioMessage.fileLength ? Number(m.audioMessage.fileLength) : null;
      replyToMessageId = m.audioMessage.contextInfo?.stanzaId || null;
    }
    // 5. Documents
    else if (m.documentMessage) {
      type = 'document';
      caption = m.documentMessage.caption || null;
      mediaFileName = m.documentMessage.fileName || 'document';
      mediaMime = m.documentMessage.mimetype || 'application/octet-stream';
      mediaSize = m.documentMessage.fileLength ? Number(m.documentMessage.fileLength) : null;
      replyToMessageId = m.documentMessage.contextInfo?.stanzaId || null;
    }
    // 6. Stickers
    else if (m.stickerMessage) {
      type = 'sticker';
      mediaMime = m.stickerMessage.mimetype || 'image/webp';
      mediaSize = m.stickerMessage.fileLength ? Number(m.stickerMessage.fileLength) : null;
      replyToMessageId = m.stickerMessage.contextInfo?.stanzaId || null;
    }
    // 7. Locations
    else if (m.locationMessage || m.liveLocationMessage) {
      type = 'location';
      if (m.locationMessage) {
        text =
          m.locationMessage.name ||
          m.locationMessage.address ||
          `${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude}`;
      } else if (m.liveLocationMessage) {
        text =
          m.liveLocationMessage.caption ||
          `Live Location: ${m.liveLocationMessage.degreesLatitude}, ${m.liveLocationMessage.degreesLongitude}`;
      }
    }
    // 8. Contacts
    else if (m.contactMessage || m.contactsArrayMessage) {
      type = 'contact';
      text = m.contactMessage?.displayName || 'Contact card';
    }
    // 9. Reactions
    else if (m.reactionMessage) {
      type = 'reaction';
      text = m.reactionMessage.text || '';
      replyToMessageId = m.reactionMessage.key?.id || null;
    }
    // 10. Protocol / Revoke / Edit
    else if (m.protocolMessage) {
      const protoType = m.protocolMessage.type;
      // Protocol type 0 is REVOKE in WhatsApp protobuf
      if (protoType === 0 || String(protoType) === 'REVOKE') {
        isRevoke = true;
        targetRevokeId = m.protocolMessage.key?.id || null;
        type = 'system';
      } else if (protoType === 14 || String(protoType) === 'MESSAGE_EDIT' || m.protocolMessage.editedMessage) {
        isEdit = true;
        targetEditId = m.protocolMessage.key?.id || null;
        text =
          m.protocolMessage.editedMessage?.conversation ||
          m.protocolMessage.editedMessage?.extendedTextMessage?.text ||
          null;
        type = 'text';
      } else {
        type = 'system';
      }
    } else {
      type = 'other';
    }
  } else if ((msg as { messageStubType?: number | string }).messageStubType) {
    const stubType = (msg as { messageStubType?: number | string }).messageStubType!;
    const typeStr = String(stubType).toUpperCase();
    // Ignore CIPHERTEXT stub (type 2) so temporary decryption failures waiting on retry aren't saved as phantom system messages
    if (typeStr === '2' || typeStr.includes('CIPHERTEXT')) {
      return null;
    }
    const stubParams = (msg as { messageStubParameters?: string[] }).messageStubParameters;
    type = 'system';
    text = formatStubTypeNotice(stubType, stubParams);
  }

  const sanitizedRaw = sanitizeRawPayload(msg);

  return {
    id,
    sessionId,
    chatJid,
    senderJid,
    fromMe,
    pushName: msg.pushName || null,
    type,
    text,
    caption,
    mediaMime,
    mediaFileName,
    mediaSize,
    timestamp,
    status,
    replyToMessageId,
    isRevoke,
    targetRevokeId,
    isEdit,
    targetEditId,
    isForwarded,
    forwardScore,
    mentionedJids,
    raw: sanitizedRaw,
  };
}

/**
 * Generate preview text for chat list representation.
 */
export function getMessagePreviewText(type: ParsedMessageType, text?: string | null, caption?: string | null, fileName?: string | null): string {
  switch (type) {
    case 'text':
      return text || '';
    case 'image':
      return caption ? `📷 ${caption}` : '📷 Photo';
    case 'video':
      return caption ? `🎥 ${caption}` : '🎥 Video';
    case 'audio':
      return '🎤 Voice message';
    case 'document':
      return fileName ? `📄 ${fileName}` : '📄 Document';
    case 'sticker':
      return '🎨 Sticker';
    case 'location':
      return '📍 Location';
    case 'contact':
      return '👤 Contact';
    case 'reaction':
      return text ? `Reacted ${text}` : 'Reaction';
    case 'system':
      return 'System message';
    case 'other':
    default:
      return text || 'Message';
  }
}
