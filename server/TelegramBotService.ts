import https from 'https';
import { Server as SocketIOServer } from 'socket.io';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';

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

  /**
   * Helper to perform robust HTTPS requests to Telegram Bot API
   */
  private async callTelegramApi(endpoint: string, payload?: any): Promise<any> {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || this.botToken;
    if (!this.botToken) return null;

    return new Promise((resolve, reject) => {
      const dataStr = payload ? JSON.stringify(payload) : undefined;
      const options: https.RequestOptions = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.botToken}/${endpoint}`,
        method: payload ? 'POST' : 'GET',
        headers: payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr!)
        } : {}
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ ok: res.statusCode === 200, raw: body });
          }
        });
      });

      req.on('error', (err) => reject(err));
      if (dataStr) req.write(dataStr);
      req.end();
    });
  }

  private async pollLoop() {
    while (this.isPolling) {
      try {
        const data = await this.callTelegramApi(`getUpdates?offset=${this.lastUpdateId + 1}&timeout=15`);
        if (data && data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.handleUpdate(update);
          }
        } else {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
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
    } catch (e) {
      console.error('[TelegramBot] Failed to set menu button:', e);
    }
  }

  public normalizePhone(phone: string): string {
    return authService.normalizePhone(phone);
  }

  /**
   * Process an incoming update from Telegram Webhook or Long Polling
   */
  public async handleWebhookUpdate(update: TelegramUpdate): Promise<{ success: boolean; action?: string; error?: string }> {
    return this.handleUpdate(update);
  }

  public async handleUpdate(update: TelegramUpdate): Promise<{ success: boolean; action?: string; error?: string }> {
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

        await this.sendMessage(
          chatId,
          `👋 <b>እንኳን ወደ BINGO BET በደህና መጡ!</b>\n\nለመመዝገብ የጠየቁት ስልክ ቁጥር: <code>${targetPhone}</code>\n\nእባክዎ አካውንቶን ለማረጋገጥ ከታች ያለውን <b>📲 Share My Phone Number</b> የሚለውን ቁልፍ ይጫኑ።\n\n<i>ማሳሰቢያ፡ በቴሌግራም የሚያጋሩት ስልክ ቁጥር በመተግበሪያው ላይ ካስገቡት ስልክ ጋር መመሳሰል አለበት።</i>`,
          {
            reply_markup: {
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
            }
          }
        );

        return { success: true, action: 'sent_contact_request' };
      }

      if (payload.startsWith('reset_')) {
        const rawPhone = payload.replace('reset_', '');
        const targetPhone = this.normalizePhone(rawPhone);
        this.pendingResets.set(String(fromUser.id), { phone: targetPhone, requestedAt: Date.now() });

        await this.sendMessage(
          chatId,
          `🔐 <b>የይለፍ ቃል መቀየሪያ (Password Reset Request)</b>\n\n` +
          `የይለፍ ቃል ለመቀየር የጠየቁት ስልክ ቁጥር: <code>${targetPhone}</code>\n\n` +
          `እባክዎ ማንነትዎን ለማረጋገጥ ከታች ያለውን <b>📲 Share My Phone Number</b> የሚለውን ቁልፍ ይጫኑ።\n\n` +
          `<i>ማሳሰቢያ፡ በቴሌግራም የሚያጋሩት ስልክ ቁጥር ከጠየቁት ስልክ ጋር መመሳሰል አለበት።</i>`,
          {
            reply_markup: {
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
            }
          }
        );

        return { success: true, action: 'sent_reset_contact_request' };
      }

      // Default /start
      const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
      await this.sendMessage(chatId, `👋 <b>Welcome to BINGO BET!</b>\n\n🇪🇹 Ethiopia's #1 Live 75-Ball Bingo Betting Telegram Mini App.\n\nTap below to launch the game!`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Launch BINGO BET',
                web_app: { url: webAppUrl }
              }
            ]
          ]
        }
      });
      return { success: true, action: 'sent_welcome' };
    }

    // 2. Handle shared contact message
    if (message.contact) {
      const contact = message.contact;

      // Anti-Spoofing Check: If user_id is present, verify that the shared contact belongs to the sender
      if (contact.user_id && contact.user_id !== fromUser.id) {
        await this.sendMessage(chatId, `⚠️ <b>ማረጋገጫ አልተሳካም (Verification Failed)</b>\n\nየተጋራው ስልክ ቁጥር የራስዎ አይደለም። እባክዎ የራስዎን ስልክ ቁጥር ብቻ ያጋሩ።`);
        return { success: false, error: 'Anti-spoofing check failed: contact.user_id does not match from.id' };
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

          await this.sendMessage(
            chatId,
            `❌ <b>የይለፍ ቃል መቀየር አልተፈቀደም (Password Reset Denied)</b>\n\n` +
            `የተጠየቀው ስልክ ቁጥር: <code>${expectedResetPhone}</code>\n` +
            `በቴሌግራም ያጋሩት ስልክ ቁጥር: <code>${sharedPhone}</code>\n\n` +
            `ሁለቱ ስልክ ቁጥሮች አይዛመዱም። ስለዚህ የይለፍ ቃል መቀየር አልተፈቀደም።`
          );

          return { success: false, error: 'Password reset phone mismatch' };
        }

        // MATCH! Authorize password reset
        const authResult = authService.authorizePasswordReset(sharedPhone);
        if (authResult.success) {
          if (this.io) {
            this.io.to(`reset_${sharedPhone}`).emit('PASSWORD_RESET_AUTHORIZED', {
              phone: sharedPhone,
              resetToken: authResult.resetToken
            });
          }

          await this.sendMessage(
            chatId,
            `✅ <b>ማንነትዎ በትክክል ተረጋግጧል! (Identity Confirmed)</b>\n\n` +
            `አሁን በመተግበሪያው ላይ አዲሱን የይለፍ ቃልዎን ማስገባት ይችላሉ።`,
            {
              reply_markup: {
                remove_keyboard: true
              }
            }
          );

          return { success: true, action: 'password_reset_authorized' };
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

        await this.sendMessage(
          chatId,
          `❌ <b>ማረጋገጫ አልተሳካም (Verification Denied)</b>\n\n` +
          `በመተግበሪያው ላይ ያስገቡት ስልክ ቁጥር: <code>${expectedPhone}</code>\n` +
          `በቴሌግራም ያጋሩት ስልክ ቁጥር: <code>${sharedPhone}</code>\n\n` +
          `ሁለቱ ስልክ ቁጥሮች አይዛመዱም (Phone numbers do not match)።\n` +
          `🚫 <b>አዲስ አካውንት አልተከፈተም (Account creation denied)</b>።\n\n` +
          `እባክዎ በመተግበሪያው ላይ የራስዎን ትክክለኛ ስልክ ቁጥር ሞልተው እንደገና ይሞክሩ።`
        );

        return {
          success: false,
          error: `Phone number mismatch: expected ${expectedPhone} but received ${sharedPhone}`
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
            user: verifyResult.user,
            token: verifyResult.token
          });
          this.io.to(`reg_${sharedPhone}`).emit('PHONE_VERIFIED', {
            phone: sharedPhone,
            success: true,
            user: verifyResult.user,
            token: verifyResult.token
          });
        }

        const appUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

        // Send confirmation on Telegram
        await this.sendMessage(chatId, `✅ <b>ስልክ ቁጥርዎ በትክክል ተረጋግጧል! (Phone Verified)</b>\n\n🎉 እንኳን ደስ አለዎት! <b>${verifyResult.user.username}</b> አዲስ አካውንትዎ በተሳካ ሁኔታ ተከፍቷል።\n💰 <b>1,000 Birr</b> የመጫወቻ ቦነስ ወደ ዋሌትዎ ገብቷል። አሁኑኑ መጫወት ይጀምሩ!`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎮 Launch BINGO BET App',
                  web_app: { url: appUrl }
                }
              ]
            ],
            remove_keyboard: true
          }
        });

        return { success: true, action: 'phone_verified' };
      } else {
        await this.sendMessage(
          chatId,
          `⚠️ <b>ምዝገባ አልተገኘም (No Sign-up Request Found)</b>\n\n` +
          `ለዚህ ስልክ ቁጥር (${sharedPhone}) የተጠየቀ የምዝገባ ጥያቄ አልተገኘም።\n` +
          `እባክዎ በመጀመሪያ በመተግበሪያው ላይ ስም እና የይለፍ ቃል ሞልተው 'Create Account' የሚለውን ይጫኑ።`
        );
        return { success: false, error: verifyResult.error };
      }
    }

    return { success: true, action: 'no_action' };
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
          phone: actualShared,
          success: true,
          user: verifyResult.user,
          token: verifyResult.token
        });
        this.io.to(`reg_${actualShared}`).emit('PHONE_VERIFIED', {
          phone: actualShared,
          success: true,
          user: verifyResult.user,
          token: verifyResult.token
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
          resetToken: authResult.resetToken
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
