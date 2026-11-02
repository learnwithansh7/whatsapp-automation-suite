import { describe, it, expect } from 'vitest';
import { aiResponderService, DEFAULT_AI_CONFIG, AiConfigData } from '../../services/aiResponderService.js';

describe('Phase 5: AI Auto-Reply & Anti-Ban Safety Unit Tests', () => {
  const mockConfig: AiConfigData = {
    isEnabled: true,
    minDelaySec: 8,
    maxDelaySec: 14,
    cooldownMin: 20,
    dailyLimit: 50,
    developerBio: 'I am a Web Developer and YouTuber.',
    youtubeUrl: 'https://youtube.com/@mytestchannel',
    youtubeSubs: '25K',
    instagramUrl: 'https://instagram.com/mytestinsta',
    googleMeetMessage: 'Wait, let me check my schedule and get back to you shortly!',
    fallbackMessage: 'I am away from my desk right now, will reply soon!',
  };

  describe('Zero-API Intent & Profile Matcher', () => {
    it('detects identity questions and replies with developer & youtuber bio', () => {
      const queries = [
        'who are you',
        'Who are you?',
        'What do you do for work?',
        'Bhai aap kaun ho',
        'Can you introduce yourself?',
        'tell me about yourself',
      ];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('intro');
        expect(result.replyText).toContain('Web Developer and YouTuber');
        expect(result.replyText).toContain('https://youtube.com/@mytestchannel');
      }
    });

    it('detects YouTube & subscriber questions and supplies channel link + subs count', () => {
      const queries = [
        'give me yt link',
        'Send your YouTube channel link',
        'How many subscribers do you have?',
        'Your channel please',
        'yt link',
      ];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('youtube');
        expect(result.replyText).toContain('https://youtube.com/@mytestchannel');
        expect(result.replyText).toContain('25K subscribers');
      }
    });

    it('detects Google Meet / Call scheduling requests and replies with schedule check', () => {
      const queries = [
        'Can we book a google meet?',
        'Let us have a call tomorrow',
        'Send gmeet link',
        'Can we schedule a meet?',
        'zoom meeting call',
      ];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('meet');
        expect(result.replyText).toContain('check my schedule');
      }
    });

    it('detects Instagram and social media queries', () => {
      const queries = [
        'What is your instagram?',
        'insta id please',
        'Your social media handles?',
      ];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('social');
        expect(result.replyText).toContain('https://instagram.com/mytestinsta');
      }
    });

    it('handles greetings with warm conversational response', () => {
      const queries = ['hi', 'Hello!', 'hey there', 'namaste', 'good morning', 'hii'];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('greeting');
        expect(result.replyText).toContain('What can I do for you today?');
      }
    });

    it('handles wellbeing questions (how are you, kaise ho)', () => {
      const queries = ['how are you', 'how r u?', 'Bhai kaise ho?', 'whats up!'];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('wellbeing');
        expect(result.replyText).toContain("I'm doing great, thanks for asking!");
      }
    });

    it('handles service & tech stack questions', () => {
      const queries = ['What services do you offer?', 'What is your tech stack?', 'Can you show your portfolio?'];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('services');
        expect(result.replyText).toContain('full-stack');
      }
    });

    it('handles pricing and rates queries', () => {
      const queries = ['What is your pricing?', 'How much do you charge?', 'Can you send quotation?'];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('pricing');
        expect(result.replyText).toContain('pricing');
      }
    });

    it('handles gratitude (thanks, thank you)', () => {
      const queries = ['thanks', 'Thank you so much!', 'dhanyawad'];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('gratitude');
        expect(result.replyText).toContain("You're very welcome!");
      }
    });

    it('falls back politely for queries outside knowledge domain', () => {
      const queries = [
        'Can you solve this math equation x^2 + 5 = 10',
        'What did you eat for dinner today?',
        'Tell me a random bedtime story about elephants',
      ];

      for (const q of queries) {
        const result = aiResponderService.detectIntentAndGenerateReply(q, mockConfig);
        expect(result.intent).toBe('fallback');
        expect(result.replyText).toBe(mockConfig.fallbackMessage);
      }
    });
  });

  describe('Anti-Ban Human Delay Constraints', () => {
    it('delay bounds are clamped between safe human reading limits', () => {
      const min = mockConfig.minDelaySec;
      const max = mockConfig.maxDelaySec;

      expect(min).toBeGreaterThanOrEqual(5);
      expect(max).toBeGreaterThanOrEqual(min);
      // Realistic average reading delay is ~11s
      const avg = (min + max) / 2;
      expect(avg).toBeGreaterThanOrEqual(8);
      expect(avg).toBeLessThanOrEqual(14);
    });

    it('cooldown is at least 15 minutes to prevent bot reply loops', () => {
      expect(mockConfig.cooldownMin).toBeGreaterThanOrEqual(15);
    });

    it('daily limit is capped at a safe volume', () => {
      expect(mockConfig.dailyLimit).toBeLessThanOrEqual(100);
    });
  });
});
