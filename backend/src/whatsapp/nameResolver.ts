/**
 * Shared name resolution utility for WhatsApp contacts, chats, and senders.
 * Enforces the strict priority rule:
 * savedName > group subject > verifiedName > pushName > formatted phone number > "Unknown"
 */

export interface NameResolutionOptions {
  savedName?: string | null;
  groupSubject?: string | null;
  verifiedName?: string | null;
  pushName?: string | null;
  phoneNumber?: string | null;
  jid?: string | null;
}

/**
 * Format a phone number into clean international style, e.g.:
 * 919876543210 -> +91 98765 43210
 * 15551234567 -> +1 555 123 4567
 */
export function formatPhoneNumber(raw?: string | null): string {
  if (!raw) return '';

  // Strip JID suffix if present (e.g. "919876543210:1@s.whatsapp.net")
  const clean = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!clean) return '';

  // India numbers (Country code 91, 10-digit subscriber number)
  if (clean.startsWith('91') && clean.length === 12) {
    const cc = clean.slice(0, 2);
    const part1 = clean.slice(2, 7);
    const part2 = clean.slice(7);
    return `+${cc} ${part1} ${part2}`;
  }

  // North America (Country code 1, 10-digit subscriber number)
  if (clean.startsWith('1') && clean.length === 11) {
    const cc = clean.slice(0, 1);
    const area = clean.slice(1, 4);
    const prefix = clean.slice(4, 7);
    const line = clean.slice(7);
    return `+${cc} ${area} ${prefix} ${line}`;
  }

  // UK numbers (Country code 44)
  if (clean.startsWith('44') && clean.length >= 11) {
    const cc = clean.slice(0, 2);
    const rest = clean.slice(2);
    return `+${cc} ${rest.slice(0, 4)} ${rest.slice(4)}`;
  }

  // Generic international fallback: +<first 2-3 digits> <rest>
  if (clean.length > 7) {
    const ccLen = clean.length > 10 ? 2 : 1;
    const cc = clean.slice(0, ccLen);
    const rest = clean.slice(ccLen);
    const mid = Math.ceil(rest.length / 2);
    return `+${cc} ${rest.slice(0, mid)} ${rest.slice(mid)}`;
  }

  return `+${clean}`;
}

/**
 * Resolves a human-readable display name for any contact or chat using the unified priority:
 * 1. savedName (name saved in phone address book)
 * 2. groupSubject (group chat title)
 * 3. verifiedName (verified business name)
 * 4. pushName (person's own self-set WhatsApp profile name)
 * 5. formatted phone number (+91 98765 43210)
 * 6. "Unknown" fallback
 */
export function resolveDisplayName(options: NameResolutionOptions): string {
  // 1. Saved name from user's phone contacts
  if (options.savedName && options.savedName.trim().length > 0) {
    return options.savedName.trim();
  }

  // 2. Group subject
  if (options.groupSubject && options.groupSubject.trim().length > 0) {
    return options.groupSubject.trim();
  }

  // 3. Verified business name
  if (options.verifiedName && options.verifiedName.trim().length > 0) {
    return options.verifiedName.trim();
  }

  // 4. Contact's push name (their own WhatsApp profile name)
  if (options.pushName && options.pushName.trim().length > 0) {
    return options.pushName.trim();
  }

  // 5. Phone number (from explicit field or extracted from JID)
  let phone = options.phoneNumber;
  if (!phone && options.jid && options.jid.includes('@s.whatsapp.net')) {
    phone = options.jid.split('@')[0].split(':')[0];
  }

  if (phone && phone.replace(/\D/g, '').length >= 7) {
    return formatPhoneNumber(phone);
  }

  // Fallback
  return 'Unknown';
}
