/**
 * WhatsApp Module public barrier.
 * No external file in the application may import Baileys directly.
 */
export { sessionManager } from './sessionManager.js';
export type {
  SessionStatus,
  SessionStatusInfo,
  SessionEvent,
} from './sessionManager.js';
export { calculateBackoff, classifyDisconnectReason } from './backoff.js';
export { ingestionService } from './ingestionService.js';
export { mapMessageStatus, parseWAMessage, getMessagePreviewText } from './messageParser.js';
export type { ParsedMessage, ParsedMessageType } from './messageParser.js';
