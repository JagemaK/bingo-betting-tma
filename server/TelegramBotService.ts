import { Server as SocketIOServer } from 'socket.io';
import { fetch as undiciFetch, Agent } from 'undici';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';

const telegramAgent = new Agent({
  connect: { timeout: 25000 },
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 120000
});

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id: number;
  vcard?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  date: number;
  text?: string;
  contact?: TelegramContact;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramWebhookResult {
  success: boolean;
  action?: string;
  error?: string;
  user?: any;
  token?: string;
  webhookResponse?: {
    method: string;
    chat_id: number | string;
    text?: string;
    parse_mode?: string;
    reply_markup?: any;
    [key: string]: any;
  };
}

export class TelegramBotService {
  private io?: SocketIOServer;
  private botToken?: string;
  private botUsername: string = process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT';
  private pendingVerifications: Map<string, { phone: string; requestedAt: number }> = new Map(); // tgUserId -> { phone }
  private pendingResets: Map<string, { phone: string; requestedAt: number }> = new Map(); // tgUserId -> { phone }
  private isPolling: boolean = false;
  private lastUpdateId: number = 0;

  constructor(io?: SocketIOServer) {
    this.io = io;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
  }

  public setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  public setIo(io: SocketIOServer) {
    this.setSocketServer(io);
  }

  public startPolling() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    this.botUsername = process.env.TELEGRAM_BOT_USERNAME || this.botUsername;
    if (!this.botToken || this.isPolling) return;
    this.isPolling = true;
    console.log(`[TelegramBot] Started polling for updates on @${this.botUsername}...`);
    this.pollLoop();
  }

  public stopPolling() {
    this.isPolling = false;
  }

  public async setWebhook(webhookUrl: string, secretToken?: string) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    if (!this.botToken) return;
    this.stopPolling();
    try {
      const secret = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;
      const payload: any = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      };
      if (secret) {
        payload.secret_token = secret;
      }
      const data = await this.callTelegramApi('setWebhook', payload);
      console.log(`[TelegramBot] Webhook successfully set to ${webhookUrl}:`, data);
    } catch (e) {
      console.error('[TelegramBot] Failed to set webhook:', e);
    }
  }

  public async deleteWebhook() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    if (!this.botToken) return;
    try {
      const data = await this.callTelegramApi('deleteWebhook');
      console.log('[TelegramBot] Webhook deleted:', data);
    } catch (e) {
      console.error('[TelegramBot] Failed to delete webhook:', e);
    }
  }

  /**
   * Helper to perform robust HTTPS requests to Telegram Bot API with undici Agent and retry
   */
  private async callTelegramApi(endpoint: string, payload?: any): Promise<any> {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    if (!this.botToken) return null;

    const url = `https://api.telegram.org/bot${this.botToken}/${endpoint}`;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await undiciFetch(url, {
          method: payload ? 'POST' : 'GET',
          headers: payload ? { 'Content-Type': 'application/json' } : {},
          body: payload ? JSON.stringify(payload) : undefined,
          dispatcher: telegramAgent,
          signal: AbortSignal.timeout(25000)
        });
        const data = await response.json();
        return data;
      } catch (err: any) {
        lastError = err;
        console.warn(`[TelegramBot] API attempt ${attempt}/3 failed on ${endpoint}:`, err?.message || err);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    console.error(`[TelegramBot] API Error on ${endpoint} after 3 attempts:`, lastError?.message || lastError);
    return null;
  }

  private async pollLoop() {
    while (this.isPolling) {
      try {
        const data = await this.callTelegramApi(`getUpdates?offset=${this.lastUpdateId + 1}&timeout=15`);
        if (data && data.ok && Array.isArray(data.result)) {
          if (data.result.length > 0) {
            console.log(`[TelegramBot] Polling received ${data.result.length} update(s).`);
          }
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.handleUpdate(update);
          }
        } else if (data && !data.ok) {
          console.warn('[TelegramBot] Polling response not ok:', data);
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        console.error('[TelegramBot] Polling loop error:', err?.message || err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  public async setMenuButton(webAppUrl: string) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    if (!this.botToken) return;
    try {
      const data = await this.callTelegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: '🎮 Play BINGO BET',
          web_app: { url: webAppUrl }
        }
      });
      console.log(`[TelegramBot] Menu button set for ${webAppUrl}:`, data);

      // Register bot commands so Telegram shows the command menu
      await this.callTelegramApi('setMyCommands', {
        commands: [
          { command: 'play', description: '🎮 Launch BINGO BET Game' },
          { command: 'start', description: '👋 Welcome & Play BINGO BET' },
          { command: 'help', description: 'ℹ️ Instructions & Rules' }
        ]
      });
    } catch (e) {
      console.error('[TelegramBot] Failed to set menu button or commands:', e);
    }
  }

  public normalizePhone(phone: string): string {
    return authService.normalizePhone(phone);
  }

  /**
   * Process an incoming update from Telegram Webhook or Long Polling
   */
  public async handleWebhookUpdate(update: TelegramUpdate): Promise<TelegramWebhookResult> {
    return this.handleUpdate(update, true);
  }

  public async handleUpdate(update: TelegramUpdate, isWebhook: boolean = false): Promise<TelegramWebhookResult> {
    const message = update.message;
    if (!message) return { success: false, error: 'No message in update' };

    const chatId = message.chat.id;
    const fromUser = message.from;
    const text = message.text?.trim() || '';

    // 1. Handle /start command with payload (e.g. /start reg_0912345678 or /start verify_0912345678)
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const payload = parts[1] || '';

      if (payload.startsWith('reg_') || payload.startsWith('verify_')) {
        const rawPhone = payload.replace('reg_', '').replace('verify_', '');
        const targetPhone = this.normalizePhone(rawPhone);
        this.pendingVerifications.set(String(fromUser.id), { phone: targetPhone, requestedAt: Date.now() });

        const replyText = `👋 <b>እንኳን ወደ BINGO BET በደህና መጡ!</b>\n\nለመመዝገብ የጠየቁት ስልክ ቁጥር: <code>${targetPhone}</code>\n\nእባክዎ አካውንቶን ለማረጋገጥ ከታች ያለውን <b>📲 Share My Phone Number</b> የሚለውን ቁልፍ ይጫኑ።\n\n<i>ማሳሰቢያ፡ በቴሌግራም የሚያጋሩት ስልክ ቁጥር በመተግበሪያው ላይ ካስገቡት ስልክ ጋር መመሳሰል አለበት።</i>`;
        const replyMarkup = {
          keyboard: [
            [
              {
                text: '📲 Share My Phone Number',
                request_contact: true
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        if (!isWebhook) {
          await this.sendMessage(chatId, replyText, { reply_markup: replyMarkup });
        }

        return {
          success: true,
          action: 'sent_contact_request',
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: replyText,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
          }
        };
      }

      if (payload.startsWith('reset_')) {
        const rawPhone = payload.replace('reset_', '');
        const targetPhone = this.normalizePhone(rawPhone);
        this.pendingResets.set(String(fromUser.id), { phone: targetPhone, requestedAt: Date.now() });

        const replyText = `🔐 <b>የይለፍ ቃል መቀየሪያ (Password Reset Request)</b>\n\n` +
          `የይለፍ ቃል ለመቀየር የጠየቁት ስልክ ቁጥር: <code>${targetPhone}</code>\n\n` +
          `እባክዎ ማንነትዎን ለማረጋገጥ ከታች ያለውን <b>📲 Share My Phone Number</b> የሚለውን ቁልፍ ይጫኑ።\n\n` +
          `<i>ማሳሰቢያ፡ በቴሌግራም የሚያጋሩት ስልክ ቁጥር ከጠየቁት ስልክ ጋር መመሳሰል አለበት።</i>`;
        const replyMarkup = {
          keyboard: [
            [
              {
                text: '📲 Share My Phone Number',
                request_contact: true
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        if (!isWebhook) {
          await this.sendMessage(chatId, replyText, { reply_markup: replyMarkup });
        }

        return {
          success: true,
          action: 'sent_reset_contact_request',
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: replyText,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
          }
        };
      }

      // Default /start
      const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
      const welcomeText = `👋 <b>Welcome to BINGO BET!</b>\n\n🇪🇹 Ethiopia's #1 Live 75-Ball Bingo Betting Telegram Mini App.\n\n🎮 Tap <b>"Launch BINGO BET"</b> below to play, or tap the menu button in the bottom-left corner!`;
      const welcomeMarkup = {
        inline_keyboard: [
          [
            {
              text: '🎮 Launch BINGO BET (Mini App)',
              web_app: { url: webAppUrl }
            }
          ],
          [
            {
              text: '🌐 Play in Browser (Direct Link)',
              url: webAppUrl
            }
          ]
        ]
      };

      if (!isWebhook) {
        await this.sendMessage(chatId, welcomeText, { reply_markup: welcomeMarkup });
      }

      return {
        success: true,
        action: 'sent_welcome',
        webhookResponse: {
          method: 'sendMessage',
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'HTML',
          reply_markup: welcomeMarkup
        }
      };
    }

    // 2. Handle shared contact message
    if (message.contact) {
      const contact = message.contact;

      // Anti-Spoofing Check: If user_id is present, verify that the shared contact belongs to the sender
      if (contact.user_id && contact.user_id !== fromUser.id) {
        const spoofText = `⚠️ <b>ማረጋገጫ አልተሳካም (Verification Failed)</b>\n\nየተጋራው ስልክ ቁጥር የራስዎ አይደለም። እባክዎ የራስዎን ስልክ ቁጥር ብቻ ያጋሩ።`;
        if (!isWebhook) {
          await this.sendMessage(chatId, spoofText);
        }
        return {
          success: false,
          error: 'Anti-spoofing check failed: contact.user_id does not match from.id',
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: spoofText,
            parse_mode: 'HTML'
          }
        };
      }

      const sharedPhone = this.normalizePhone(contact.phone_number);

      // Check if this contact share is for Password Reset
      const pendingReset = this.pendingResets.get(String(fromUser.id));
      if (pendingReset) {
        const expectedResetPhone = pendingReset.phone;
        this.pendingResets.delete(String(fromUser.id));

        if (expectedResetPhone && expectedResetPhone !== sharedPhone) {
          authService.denyPasswordReset(expectedResetPhone, `Phone mismatch: Reset requested ${expectedResetPhone} but Telegram shared ${sharedPhone}`);
          if (this.io) {
            this.io.to(`reset_${expectedResetPhone}`).emit('PASSWORD_RESET_DENIED', {
              expectedPhone: expectedResetPhone,
              sharedPhone,
              reason: `Phone mismatch: Reset requested ${expectedResetPhone} but Telegram shared ${sharedPhone}`
            });
          }

          const denyText = `❌ <b>የይለፍ ቃል መቀየር አልተፈቀደም (Password Reset Denied)</b>\n\n` +
            `የተጠየቀው ስልክ ቁጥር: <code>${expectedResetPhone}</code>\n` +
            `በቴሌግራም ያጋሩት ስልክ ቁጥር: <code>${sharedPhone}</code>\n\n` +
            `ሁለቱ ስልክ ቁጥሮች አይዛመዱም። ስለዚህ የይለፍ ቃል መቀየር አልተፈቀደም።`;

          if (!isWebhook) {
            await this.sendMessage(chatId, denyText);
          }

          return {
            success: false,
            error: 'Password reset phone mismatch',
            webhookResponse: {
              method: 'sendMessage',
              chat_id: chatId,
              text: denyText,
              parse_mode: 'HTML'
            }
          };
        }

        // MATCH! Authorize password reset
        const authResult = authService.authorizePasswordReset(sharedPhone);
        if (authResult.success) {
          if (this.io) {
            this.io.to(`reset_${sharedPhone}`).emit('PASSWORD_RESET_AUTHORIZED', {
              phone: sharedPhone,
              success: true,
              status: 'AUTHORIZED'
            });
          }

          const authText = `✅ <b>ማንነትዎ በትክክል ተረጋግጧል! (Identity Confirmed)</b>\n\n` +
            `አሁን በመተግበሪያው ላይ አዲሱን የይለፍ ቃልዎን ማስገባት ይችላሉ።`;
          const removeMarkup = { remove_keyboard: true };

          if (!isWebhook) {
            await this.sendMessage(chatId, authText, { reply_markup: removeMarkup });
          }

          return {
            success: true,
            action: 'password_reset_authorized',
            webhookResponse: {
              method: 'sendMessage',
              chat_id: chatId,
              text: authText,
              parse_mode: 'HTML',
              reply_markup: removeMarkup
            }
          };
        }
      }

      const pendingInfo = this.pendingVerifications.get(String(fromUser.id));
      const expectedPhone = pendingInfo?.phone;
      this.pendingVerifications.delete(String(fromUser.id));

      const displayName = `${fromUser.first_name || ''} ${fromUser.last_name || ''}`.trim() || fromUser.username || `Player_${sharedPhone.slice(-4)}`;

      // STRICT PHONE MATCHING:
      // If the user initiated registration for an expected phone, the shared contact MUST match that phone!
      if (expectedPhone && expectedPhone !== sharedPhone) {
        // MISMATCH DETECTED -> DENY ACCOUNT CREATION!
        authService.denyPendingRegistration(expectedPhone, `Phone number mismatch: Sign-up requested ${expectedPhone} but Telegram shared ${sharedPhone}`);

        if (this.io) {
          this.io.to(`reg_${expectedPhone}`).emit('REGISTRATION_DENIED', {
            expectedPhone,
            sharedPhone,
            reason: `Phone mismatch: Sign-up requested ${expectedPhone} but Telegram shared ${sharedPhone}`
          });
        }

        const mismatchText = `❌ <b>ማረጋገጫ አልተሳካም (Verification Denied)</b>\n\n` +
          `በመተግበሪያው ላይ ያስገቡት ስልክ ቁጥር: <code>${expectedPhone}</code>\n` +
          `በቴሌግራም ያጋሩት ስልክ ቁጥር: <code>${sharedPhone}</code>\n\n` +
          `ሁለቱ ስልክ ቁጥሮች አይዛመዱም (Phone numbers do not match)።\n` +
          `🚫 <b>አዲስ አካውንት አልተከፈተም (Account creation denied)</b>።\n\n` +
          `እባክዎ በመተግበሪያው ላይ የራስዎን ትክክለኛ ስልክ ቁጥር ሞልተው እንደገና ይሞክሩ።`;

        if (!isWebhook) {
          await this.sendMessage(chatId, mismatchText);
        }

        return {
          success: false,
          error: `Phone number mismatch: expected ${expectedPhone} but received ${sharedPhone}`,
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: mismatchText,
            parse_mode: 'HTML'
          }
        };
      }

      // MATCH CONFIRMED (or direct registration): Complete registration and create new user account
      const verifyResult = authService.completeRegistrationWithMatchedPhone(
        sharedPhone,
        String(fromUser.id),
        displayName
      );

      if (verifyResult.success && verifyResult.user) {
        // Broadcast real-time verification to Web/TMA frontend via Socket.io (scoped to registration room)
        if (this.io) {
          this.io.to(`reg_${sharedPhone}`).emit('REGISTRATION_SUCCESS', {
            phone: sharedPhone,
            success: true,
            status: 'VERIFIED'
          });
          this.io.to(`reg_${sharedPhone}`).emit('PHONE_VERIFIED', {
            phone: sharedPhone,
            success: true,
            status: 'VERIFIED'
          });
        }

        const appUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
        const verifiedText = `✅ <b>ስልክ ቁጥርዎ በትክክል ተረጋግጧል! (Phone Verified)</b>\n\n🎉 እንኳን ደስ አለዎት! <b>${verifyResult.user.username}</b> አዲስ አካውንትዎ በተሳካ ሁኔታ ተከፍቷል።\n💰 <b>የመጀመሪያ ተቀማጭ 10% ተጨማሪ ቦነስ (እስከ 50 ብር) ያግኙ!</b> አሁኑኑ መጫወት ይጀምሩ!`;
        const verifiedMarkup = {
          inline_keyboard: [
            [
              {
                text: '🎮 Launch BINGO BET App',
                web_app: { url: appUrl }
              }
            ]
          ],
          remove_keyboard: true
        };

        if (!isWebhook) {
          await this.sendMessage(chatId, verifiedText, { reply_markup: verifiedMarkup });
        }

        return {
          success: true,
          action: 'phone_verified',
          user: verifyResult.user,
          token: verifyResult.token,
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: verifiedText,
            parse_mode: 'HTML',
            reply_markup: verifiedMarkup
          }
        };
      } else {
        const notFoundText = `⚠️ <b>ምዝገባ አልተገኘም (No Sign-up Request Found)</b>\n\n` +
          `ለዚህ ስልክ ቁጥር (${sharedPhone}) የተጠየቀ የምዝገባ ጥያቄ አልተገኘም።\n` +
          `እባክዎ በመጀመሪያ በመተግበሪያው ላይ ስም እና የይለፍ ቃል ሞልተው 'Create Account' የሚለውን ይጫኑ።`;

        if (!isWebhook) {
          await this.sendMessage(chatId, notFoundText);
        }

        return {
          success: false,
          error: verifyResult.error,
          webhookResponse: {
            method: 'sendMessage',
            chat_id: chatId,
            text: notFoundText,
            parse_mode: 'HTML'
          }
        };
      }
    }

    // 3. Universal Fallback: If user types anything else (greetings, /play, /help, text)
    const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    console.log(`[TelegramBot] Replying to incoming user message from @${fromUser?.username || fromUser?.id}: "${text}"`);
    const fallbackText = `👋 <b>Welcome to BINGO BET!</b>\n\n🇪🇹 Ethiopia's #1 Live 75-Ball Bingo Betting Game.\n\n🎮 <b>Tap below to play:</b>`;
    const fallbackMarkup = {
      inline_keyboard: [
        [
          {
            text: '🎮 Launch BINGO BET (Mini App)',
            web_app: { url: webAppUrl }
          }
        ],
        [
          {
            text: '🌐 Play in Browser (Direct Link)',
            url: webAppUrl
          }
        ]
      ]
    };

    if (!isWebhook) {
      await this.sendMessage(chatId, fallbackText, { reply_markup: fallbackMarkup });
    }

    return {
      success: true,
      action: 'sent_fallback_welcome',
      webhookResponse: {
        method: 'sendMessage',
        chat_id: chatId,
        text: fallbackText,
        parse_mode: 'HTML',
        reply_markup: fallbackMarkup
      }
    };
  }

  /**
   * Helper to simulate contact sharing (useful for automated testing & browser demo)
   * Supports testing both matching phone (success) and mismatched phone (denial).
   */
  public simulateContactShare(
    expectedPhone: string,
    sharedPhone?: string,
    tgUserId: number = 12345678,
    username: string = 'HabeshaPlayer'
  ): { success: boolean; user?: any; token?: string; error?: string; denied?: boolean } {
    const targetExpected = this.normalizePhone(expectedPhone);
    const actualShared = sharedPhone ? this.normalizePhone(sharedPhone) : targetExpected;

    // Check for mismatch scenario
    if (targetExpected && actualShared && targetExpected !== actualShared) {
      authService.denyPendingRegistration(
        targetExpected,
        `Phone mismatch: Sign-up requested ${targetExpected} but Telegram shared ${actualShared}`
      );
      if (this.io) {
        this.io.to(`reg_${targetExpected}`).emit('REGISTRATION_DENIED', {
          expectedPhone: targetExpected,
          sharedPhone: actualShared,
          reason: `Phone mismatch: Sign-up requested ${targetExpected} but Telegram shared ${actualShared}`
        });
      }
      return {
        success: false,
        denied: true,
        error: `Verification Denied: Sign-up phone (${targetExpected}) does not match Telegram shared phone (${actualShared}). Account creation was denied.`
      };
    }

    const verifyResult = authService.completeRegistrationWithMatchedPhone(
      actualShared,
      String(tgUserId),
      username
    );

    if (verifyResult.success) {
      if (this.io) {
        this.io.to(`reg_${actualShared}`).emit('REGISTRATION_SUCCESS', {
          phone: expectedPhone || actualShared,
          success: true,
          status: 'VERIFIED'
        });
        this.io.to(`reg_${actualShared}`).emit('PHONE_VERIFIED', {
          phone: expectedPhone || actualShared,
          success: true,
          status: 'VERIFIED'
        });
      }
      return { success: true, user: verifyResult.user, token: verifyResult.token };
    }

    return { success: false, error: verifyResult.error || 'Verification failed' };
  }

  /**
   * Helper to simulate password reset contact sharing
   */
  public simulatePasswordResetShare(
    expectedPhone: string,
    sharedPhone?: string
  ): { success: boolean; resetToken?: string; error?: string; denied?: boolean } {
    const targetExpected = this.normalizePhone(expectedPhone);
    const actualShared = sharedPhone ? this.normalizePhone(sharedPhone) : targetExpected;

    if (targetExpected && actualShared && targetExpected !== actualShared) {
      authService.denyPasswordReset(targetExpected, `Phone mismatch: Reset requested ${targetExpected} but Telegram shared ${actualShared}`);
      if (this.io) {
        this.io.to(`reset_${targetExpected}`).emit('PASSWORD_RESET_DENIED', {
          expectedPhone: targetExpected,
          sharedPhone: actualShared,
          reason: `Phone mismatch: Reset requested ${targetExpected} but Telegram shared ${actualShared}`
        });
      }
      return { success: false, denied: true, error: 'Phone mismatch: Password reset denied.' };
    }

    const authResult = authService.authorizePasswordReset(actualShared);
    if (authResult.success) {
      if (this.io) {
        this.io.to(`reset_${actualShared}`).emit('PASSWORD_RESET_AUTHORIZED', {
          phone: actualShared,
          success: true,
          status: 'AUTHORIZED'
        });
      }
      return { success: true, resetToken: authResult.resetToken };
    }

    return { success: false, error: authResult.error || 'Password reset authorization failed' };
  }

  /**
   * Send message via Telegram Bot API
   */
  private async sendMessage(chatId: number | string, text: string, options: any = {}): Promise<void> {
    if (!this.botToken) {
      console.log(`[TelegramBot Mock] To: ${chatId} | Message: ${text.replace(/<[^>]*>/g, '')}`);
      return;
    }

    try {
      await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options
      });
    } catch (err) {
      console.error('[TelegramBot] Failed to send message:', err);
    }
  }
}

export const telegramBotService = new TelegramBotService();
