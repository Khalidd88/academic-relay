export interface SendNotificationResult {
  success: boolean;
  channel: 'TELEGRAM' | 'WAHA';
  recipient: string;
  error?: string;
}

/**
 * Dual-Channel Notification Helper
 * Dispatches message via Telegram (testing/simulation) or WAHA (production WhatsApp).
 */
export async function sendNotification(
  targetNumber: string,
  message: string
): Promise<SendNotificationResult> {
  const channel = (process.env.NOTIFY_CHANNEL || 'TELEGRAM').toUpperCase();
  const cleanTargetNumber = targetNumber.replace(/\D/g, '');

  if (channel === 'TELEGRAM') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const testChatId = process.env.TELEGRAM_TEST_CHAT_ID;

    if (!botToken || !testChatId) {
      console.error('[Notification] Telegram credentials missing in environment variables.');
      return {
        success: false,
        channel: 'TELEGRAM',
        recipient: cleanTargetNumber,
        error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_TEST_CHAT_ID not configured',
      };
    }

    try {
      const telegramText = `📱 *[Simulasi WA ke: +${cleanTargetNumber}]*\n\n${message}`;
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: testChatId,
          text: telegramText,
          parse_mode: 'Markdown',
        }),
      });

      const data = (await response.json()) as { ok: boolean; description?: string };
      if (!data.ok) {
        console.error('[Notification] Telegram API Error:', data.description);
        return {
          success: false,
          channel: 'TELEGRAM',
          recipient: cleanTargetNumber,
          error: data.description,
        };
      }

      return {
        success: true,
        channel: 'TELEGRAM',
        recipient: cleanTargetNumber,
      };
    } catch (err: any) {
      console.error('[Notification] Failed to send Telegram message:', err?.message);
      return {
        success: false,
        channel: 'TELEGRAM',
        recipient: cleanTargetNumber,
        error: err?.message,
      };
    }
  }

  // Fallback to WAHA (WhatsApp HTTP API)
  const baseUrl = process.env.WAHA_BASE_URL || 'http://127.0.0.1:3005';
  const session = process.env.WAHA_SESSION || 'default';
  const apiKey = process.env.WAHA_API_KEY || '';

  try {
    const formattedChatId = targetNumber.includes('@') ? targetNumber : `${cleanTargetNumber}@c.us`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    const response = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session,
        chatId: formattedChatId,
        text: message,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Notification] WAHA API HTTP ${response.status}:`, errText);
      return {
        success: false,
        channel: 'WAHA',
        recipient: cleanTargetNumber,
        error: `WAHA returned ${response.status}`,
      };
    }

    return {
      success: true,
      channel: 'WAHA',
      recipient: cleanTargetNumber,
    };
  } catch (err: any) {
    console.error('[Notification] Failed to send WAHA message:', err?.message);
    return {
      success: false,
      channel: 'WAHA',
      recipient: cleanTargetNumber,
      error: err?.message,
    };
  }
}
