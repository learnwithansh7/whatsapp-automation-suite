import { prisma } from '../lib/prisma.js';
import { sendQueue } from './sendQueue.js';
import type { WASocket } from '@whiskeysockets/baileys';

export interface AiConfigData {
  isEnabled: boolean;
  minDelaySec: number;
  maxDelaySec: number;
  cooldownMin: number;
  dailyLimit: number;
  developerBio: string | null;
  youtubeUrl: string | null;
  youtubeSubs: string | null;
  instagramUrl: string | null;
  googleMeetMessage: string | null;
  fallbackMessage: string | null;
}

export const DEFAULT_AI_CONFIG: Omit<AiConfigData, 'id'> = {
  isEnabled: true,
  minDelaySec: 8,
  maxDelaySec: 14,
  cooldownMin: 0, // 0 = natural back-and-forth conversation enabled
  dailyLimit: 50,
  developerBio: 'Hey! I am a Web Developer and YouTuber. I build modern web applications and create tech content on YouTube.',
  youtubeUrl: 'https://youtube.com/@yourchannel',
  youtubeSubs: '10K+',
  instagramUrl: 'https://instagram.com/yourhandle',
  googleMeetMessage: 'Wait, let me check my schedule and I will get back to you shortly with an available time slot!',
  fallbackMessage: "I'm currently away from my desk, but I've received your message and will get back to you personally soon!",
};

export class AiResponderService {
  private getSocketFn: ((sessionId: string) => WASocket | null) | null = null;
  // Track active pending timers so if user replies manually from phone, we cancel the auto-reply
  private pendingReplies = new Map<string, NodeJS.Timeout>();
  // Track recently sent AI responses to avoid echoing our own bot messages
  private recentAiSentTexts = new Set<string>();

  public setSocketGetter(fn: (sessionId: string) => WASocket | null) {
    this.getSocketFn = fn;
  }

  /**
   * Cancel any pending auto-reply for a given chat (e.g. if you replied manually from your phone)
   */
  public cancelPendingReply(chatJid: string) {
    const existing = this.pendingReplies.get(chatJid);
    if (existing) {
      clearTimeout(existing);
      this.pendingReplies.delete(chatJid);
      console.log(`[AiResponder] Cancelled pending auto-reply for ${chatJid} due to user activity.`);
    }
  }

  /**
   * Get or create session AI config
   */
  public async getConfig(sessionId: string): Promise<AiConfigData> {
    const existing = await prisma.aiConfig.findUnique({
      where: { sessionId },
    });

    if (existing) {
      return existing;
    }

    return prisma.aiConfig.create({
      data: {
        sessionId,
        ...DEFAULT_AI_CONFIG,
      },
    });
  }

  /**
   * Update session AI config
   */
  public async updateConfig(sessionId: string, updates: Partial<AiConfigData>): Promise<AiConfigData> {
    return prisma.aiConfig.upsert({
      where: { sessionId },
      create: {
        sessionId,
        ...DEFAULT_AI_CONFIG,
        ...updates,
      },
      update: updates,
    });
  }

  /**
   * Zero-API Intent & Profile Matcher
   */
  public detectIntentAndGenerateReply(
    incomingText: string,
    config: AiConfigData,
  ): { replyText: string; intent: string } {
    const text = incomingText
      .toLowerCase()
      .replace(/[!?.,;]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 1. Identity & "Who are you"
    if (
      text.includes('who are you') ||
      text.includes('who r u') ||
      text.includes('what do you do') ||
      text.includes('kaun ho') ||
      text.includes('introduce') ||
      text.includes('intro') ||
      text.includes('about you') ||
      text.includes('tell me about yourself')
    ) {
      const bio = config.developerBio || DEFAULT_AI_CONFIG.developerBio;
      const subs = config.youtubeSubs ? ` (${config.youtubeSubs} subscribers)` : '';
      const yt = config.youtubeUrl ? `\n\nYouTube Channel: ${config.youtubeUrl}` : '';
      return {
        replyText: `${bio}${subs}${yt}\n\nFeel free to ask me for my YouTube link, social links, or to schedule a meeting!`,
        intent: 'intro',
      };
    }

    // 2. YouTube & Subscribers
    if (
      text.includes('youtube') ||
      text.includes('yt link') ||
      text.includes('yt channel') ||
      text.includes('channel link') ||
      text.includes('subscriber') ||
      text.includes('subscribers') ||
      text.includes('subs') ||
      text.includes('your channel')
    ) {
      const yt = config.youtubeUrl || DEFAULT_AI_CONFIG.youtubeUrl;
      const subs = config.youtubeSubs || DEFAULT_AI_CONFIG.youtubeSubs;
      return {
        replyText: `Here is my YouTube channel: ${yt}\nWe currently have ${subs} subscribers! Feel free to check out my latest videos.`,
        intent: 'youtube',
      };
    }

    // 3. Google Meet / Call Booking
    if (
      text.includes('google meet') ||
      text.includes('gmeet') ||
      text.includes('meet link') ||
      text.includes('schedule a meet') ||
      text.includes('book a meet') ||
      text.includes('have a call') ||
      text.includes('zoom') ||
      text.includes('quick call') ||
      text.includes('online meet') ||
      text.includes('book a call')
    ) {
      const meetMsg = config.googleMeetMessage || DEFAULT_AI_CONFIG.googleMeetMessage;
      return {
        replyText: meetMsg!,
        intent: 'meet',
      };
    }

    // 4. Instagram & Socials
    if (
      text.includes('instagram') ||
      text.includes('insta') ||
      text.includes('social media') ||
      text.includes('social link') ||
      text.includes('social links') ||
      text.includes('socials') ||
      text.includes('social')
    ) {
      const ig = config.instagramUrl || DEFAULT_AI_CONFIG.instagramUrl;
      const yt = config.youtubeUrl || DEFAULT_AI_CONFIG.youtubeUrl;
      return {
        replyText: `Here are my social media links:\n• YouTube: ${yt}\n• Instagram: ${ig}\n\nFeel free to follow and check out my content!`,
        intent: 'social',
      };
    }

    // 5. Wellbeing / "How are you" / "Kaise ho"
    if (
      text.includes('how are you') ||
      text.includes('how r u') ||
      text.includes('how are u') ||
      text.includes('how are you doing') ||
      text.includes('kaise ho') ||
      text.includes('kya haal') ||
      text.includes('sab badhiya') ||
      text.includes('whats up') ||
      text.includes('what up') ||
      text === 'sup'
    ) {
      return {
        replyText: "I'm doing great, thanks for asking! 😊 How are you doing? What can I help you with or work on with you today?",
        intent: 'wellbeing',
      };
    }

    // 6. Services & Tech Stack / Portfolio
    if (
      text.includes('service') ||
      text.includes('services') ||
      text.includes('skills') ||
      text.includes('tech stack') ||
      text.includes('what do you build') ||
      text.includes('portfolio') ||
      text.includes('your projects') ||
      text.includes('previous work')
    ) {
      const bio = config.developerBio || DEFAULT_AI_CONFIG.developerBio;
      return {
        replyText: `${bio}\n\nI build clean, responsive full-stack applications (React, Next.js, Node.js, APIs, UI/UX) and produce tech tutorials. Tell me about the project you'd like to build!`,
        intent: 'services',
      };
    }

    // 7. Pricing & Charges / Quotes
    if (
      text.includes('price') ||
      text.includes('pricing') ||
      text.includes('how much do you charge') ||
      text.includes('what are your rates') ||
      text.includes('cost') ||
      text.includes('charges') ||
      text.includes('fees') ||
      text.includes('quotation') ||
      text.includes('kitna charge')
    ) {
      return {
        replyText: "Project pricing depends on the features, scope, and timeline you need. Share a brief overview of what you're looking to build, and we can discuss the details or schedule a quick Google Meet to go over it!",
        intent: 'pricing',
      };
    }

    // 8. Gratitude / Thanks
    if (
      text === 'thanks' ||
      text === 'thank you' ||
      text === 'thank u' ||
      text === 'ty' ||
      text === 'thx' ||
      text.includes('thank you so much') ||
      text.includes('dhanyawad') ||
      text.includes('shukriya')
    ) {
      return {
        replyText: "You're very welcome! 🙌 Feel free to reach out anytime if you need anything else.",
        intent: 'gratitude',
      };
    }

    // 9. Location & Timezone
    if (
      text.includes('where are you from') ||
      text.includes('your location') ||
      text.includes('kaha se ho') ||
      text.includes('where do you live')
    ) {
      return {
        replyText: "I'm based in India (IST), working remotely with clients and community members worldwide! 🌍 Where are you reaching out from?",
        intent: 'location',
      };
    }

    // 10. Conversational Greeting ("Hi", "Hello", "Hey", "Good morning", etc.)
    if (
      text === 'hi' ||
      text === 'hello' ||
      text === 'hey' ||
      text === 'hii' ||
      text === 'hiii' ||
      text === 'heyy' ||
      text === 'namaste' ||
      text.startsWith('hi ') ||
      text.startsWith('hello ') ||
      text.startsWith('hey ') ||
      text.startsWith('hii ') ||
      text.includes('good morning') ||
      text.includes('good afternoon') ||
      text.includes('good evening')
    ) {
      return {
        replyText: "Hey there! 👋 Great to hear from you. What can I do for you today? Let me know if you need help with web development, want to check out my YouTube content, or schedule a Google Meet!",
        intent: 'greeting',
      };
    }

    // 11. Polite Away Fallback
    const fallback = config.fallbackMessage || DEFAULT_AI_CONFIG.fallbackMessage;
    return {
      replyText: fallback!,
      intent: 'fallback',
    };
  }

  /**
   * Main entry point when a live message is received.
   */
  public async handleIncomingMessage(
    sessionId: string,
    chatJid: string,
    message: { id: string; fromMe: boolean; text?: string | null; caption?: string | null },
  ): Promise<void> {
    // 1. Safety check: NEVER auto-reply in groups, newsletters, or broadcast status
    if (
      chatJid.endsWith('@g.us') ||
      chatJid.includes('@broadcast') ||
      chatJid.endsWith('@newsletter') ||
      chatJid.includes('@temp')
    ) {
      return;
    }

    // 2. Safety check: Extract incoming text
    let incomingText = (message.text || message.caption || '').trim();
    if (!incomingText) {
      return;
    }

    // 3. Ignore echoes of our own AI bot responses to prevent loops
    if (this.recentAiSentTexts.has(incomingText)) {
      return;
    }

    // 4. Handle self-sent messages (fromMe === true):
    // If the user sends a message from their own phone or web app, check if they are testing the AI:
    // Supported triggers: /ai <prompt>, @ai <prompt>, !ai <prompt>, or conversational AI trigger questions
    let isSelfTestTrigger = false;
    const isExplicitAiCommand = /^(\/ai|@ai|!ai)\b/i.test(incomingText);

    if (message.fromMe) {
      if (isExplicitAiCommand) {
        isSelfTestTrigger = true;
        incomingText = incomingText.replace(/^(\/ai|@ai|!ai)\s*/i, '').trim();
      } else {
        const lower = incomingText.toLowerCase();
        const isCommonTestPrompt =
          lower === 'hi' ||
          lower === 'hii' ||
          lower === 'hello' ||
          lower === 'hey' ||
          lower.includes('who are you') ||
          lower.includes('what do you do') ||
          lower.includes('youtube') ||
          lower.includes('google meet') ||
          lower.includes('social') ||
          lower.includes('price') ||
          lower.includes('pricing') ||
          lower.includes('service') ||
          lower.includes('portfolio');

        if (isCommonTestPrompt) {
          isSelfTestTrigger = true;
          console.log(`[AiResponder] Self-test trigger from user in ${chatJid}: "${incomingText}"`);
        } else {
          // Normal conversation message from user to another person -> cancel any queued auto-reply
          this.cancelPendingReply(chatJid);
          return;
        }
      }
    }

    // 5. Safety check: Check if Chat has aiEnabled === true in database
    let chat = await prisma.chat.findUnique({
      where: { sessionId_jid: { sessionId, jid: chatJid } },
      select: { aiEnabled: true },
    });

    // Check alternate contact mapping (e.g. if chatJid is LID but phone chat was toggled, or vice-versa)
    if (!chat || !chat.aiEnabled) {
      const contact = await prisma.contact.findFirst({
        where: {
          sessionId,
          OR: [{ jid: chatJid }, { lid: chatJid }],
        },
        select: { jid: true, lid: true },
      });

      if (contact) {
        const alternateJid = contact.jid === chatJid ? contact.lid : contact.jid;
        if (alternateJid) {
          const alternateChat = await prisma.chat.findUnique({
            where: { sessionId_jid: { sessionId, jid: alternateJid } },
            select: { aiEnabled: true },
          });
          if (alternateChat?.aiEnabled) {
            chat = alternateChat;
          }
        }
      }
    }

    if (!chat || !chat.aiEnabled) {
      console.log(`[AiResponder] Skipping ${chatJid}: AI Auto-Reply is turned OFF for this chat. Toggle it ON in the chat header ([🤖 AI: ON]) or contact info panel.`);
      return; // Not enabled for this chat
    }

    // 6. Safety check: Check session AI master config
    const config = await this.getConfig(sessionId);
    if (!config.isEnabled) {
      console.log(`[AiResponder] Skipping ${chatJid}: AI Master Toggle is disabled in Settings.`);
      return;
    }

    // 7. Safety check: Per-contact Cooldown check
    if (config.cooldownMin > 0) {
      const cooldownMs = config.cooldownMin * 60 * 1000;
      const lastReply = await prisma.aiReplyLog.findFirst({
        where: {
          sessionId,
          chatJid,
          createdAt: { gte: new Date(Date.now() - cooldownMs) },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastReply) {
        console.log(`[AiResponder] Skipping ${chatJid} - in cooldown (${config.cooldownMin}m).`);
        return;
      }
    } else {
      // Conversational mode (cooldownMin === 0): Only a brief 4-second anti-loop debounce
      // to prevent rapid bot-to-bot bouncing
      const recentReply = await prisma.aiReplyLog.findFirst({
        where: {
          sessionId,
          chatJid,
          createdAt: { gte: new Date(Date.now() - 4000) },
        },
      });
      if (recentReply) {
        console.log(`[AiResponder] Debouncing rapid message from ${chatJid}`);
        return;
      }
    }

    // 8. Safety check: 24-hour Daily limit cap
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyCount = await prisma.aiReplyLog.count({
      where: {
        sessionId,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (dailyCount >= config.dailyLimit) {
      console.warn(`[AiResponder] Daily auto-reply limit reached (${dailyCount}/${config.dailyLimit}). Skipping.`);
      return;
    }

    // 9. Generate safe reply based on Intent
    const { replyText, intent } = this.detectIntentAndGenerateReply(incomingText, config);

    // 10. Calculate Delay:
    // For self-test triggers from the user, use a fast 2-second delay so they see it respond!
    // For external incoming messages, use the full 8-14s human simulation delay.
    let delaySec: number;
    if (isSelfTestTrigger) {
      delaySec = 2;
    } else {
      const minDelay = Math.max(5, config.minDelaySec);
      const maxDelay = Math.max(minDelay, config.maxDelaySec);
      delaySec = Math.floor(minDelay + Math.random() * (maxDelay - minDelay + 1));
    }
    const delayMs = delaySec * 1000;

    console.log(
      `[AiResponder] Queuing AI reply for ${chatJid} (intent: ${intent}, isSelfTest: ${isSelfTestTrigger}) with delay: ${delaySec}s`,
    );

    // Clear any previous timer on this chat
    this.cancelPendingReply(chatJid);

    // 11. Schedule the Human Simulation Pipeline
    const timer = setTimeout(async () => {
      this.pendingReplies.delete(chatJid);

      try {
        const sock = this.getSocketFn ? this.getSocketFn(sessionId) : null;
        if (!sock) {
          console.warn(`[AiResponder] Socket unavailable for session ${sessionId}`);
          return;
        }

        // Re-verify no newer message was sent manually (for external replies)
        if (!isSelfTestTrigger) {
          const recentFromMe = await prisma.message.findFirst({
            where: {
              sessionId,
              chatJid,
              fromMe: true,
              timestamp: { gte: new Date(Date.now() - delayMs) },
            },
          });

          if (recentFromMe && recentFromMe.id !== message.id) {
            console.log(`[AiResponder] User sent manual reply to ${chatJid} during delay. Aborting auto-reply.`);
            return;
          }
        }

        // Send 'composing' presence to simulate human typing
        await sock.sendPresenceUpdate('composing', chatJid).catch(() => {});

        // Typing duration proportional to text length (~40 WPM, clamp 2s - 5s)
        const typingDurationMs = isSelfTestTrigger
          ? 2000
          : Math.min(6500, Math.max(2500, replyText.length * 40));
        await new Promise((r) => setTimeout(r, typingDurationMs));

        // Add to recent AI sent cache so we don't echo our own reply
        this.recentAiSentTexts.add(replyText);
        setTimeout(() => {
          this.recentAiSentTexts.delete(replyText);
        }, 60000);

        // Enqueue into existing Outbox queue for safe rate-limiting and anti-ban jitter
        await sendQueue.enqueue({
          sessionId,
          chatJid,
          kind: 'text',
          text: replyText,
        });

        // Set presence back to paused
        await sock.sendPresenceUpdate('paused', chatJid).catch(() => {});

        // Record in AI reply log
        await prisma.aiReplyLog.create({
          data: {
            sessionId,
            chatJid,
            incomingText,
            replyText,
            intent,
            delaySeconds: delaySec,
          },
        });

        console.log(`[AiResponder] Successfully sent AI auto-reply to ${chatJid} (${replyText.length} chars).`);
      } catch (err) {
        console.error('[AiResponder] Failed to execute auto-reply:', err);
      }
    }, delayMs);

    this.pendingReplies.set(chatJid, timer);
  }
}

export const aiResponderService = new AiResponderService();
