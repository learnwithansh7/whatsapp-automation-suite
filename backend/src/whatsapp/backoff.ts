/**
 * Exponential backoff with jitter calculation for reconnection attempts.
 * Sequence: 1s, 2s, 4s, 8s, 16s, 32s, capped at 60s (+ randomized jitter 0-1000ms).
 */
export function calculateBackoff(
  retryCount: number,
  baseMs = 1000,
  maxMs = 60000,
  jitter = true,
): number {
  const exponential = Math.min(baseMs * Math.pow(2, Math.max(0, retryCount)), maxMs);
  const jitterOffset = jitter ? Math.floor(Math.random() * 1000) : 0;
  return Math.min(exponential + jitterOffset, maxMs + 1000);
}

export type DisconnectAction = 'wipe_logout' | 'restart_immediate' | 'reconnect_backoff' | 'stop_replaced';

/**
 * Determine the appropriate action based on Baileys disconnect status code.
 */
export function classifyDisconnectReason(statusCode?: number): DisconnectAction {
  switch (statusCode) {
    case 401: // DisconnectReason.loggedOut
      return 'wipe_logout';
    case 515: // DisconnectReason.restartRequired (e.g. after initial QR scan)
      return 'restart_immediate';
    case 440: // DisconnectReason.connectionReplaced
      return 'stop_replaced';
    default:
      return 'reconnect_backoff';
  }
}
