import { config } from '../config/index.js';
import { OrderSuggestion } from '../types.js';

export class TelegramNotifier {
  /**
   * Dispatches an order suggestion to Telegram (or console mock).
   */
  async sendOrderAlert(order: OrderSuggestion): Promise<boolean> {
    const isMock = config.simulationMode || config.telegramBotToken === 'mock_telegram_bot_token';

    const actionEmoji = order.action === 'BUY' ? '🚨 BUY RECOMMENDATION' : '⚠️ SELL RECOMMENDATION';
    const borderText = '═'.repeat(45);
    
    // Construct rich text notification body
    const textMsg = 
`╔═════════════════════════════════════════════╗
║ ${actionEmoji.padEnd(43)} ║
╠═════════════════════════════════════════════╣
║ 📍 Asset:        ${order.symbol.padEnd(26)} ║
║ 💼 Account:      ${order.accountType.padEnd(26)} ║
║ 🔢 Quantity:     ${order.quantity.toString().padEnd(26)} ║
║ 💵 Target Price: $${order.price.toFixed(2).padEnd(25)} ║
║ 💸 Approx Cost:  $${order.estimatedCost.toFixed(2).padEnd(25)} ║
╠═════════════════════════════════════════════╣
║ 📊 Portfolio Weight Allocation:             ║
║    • Current:    ${(order.portfolioWeightImpact.currentWeight * 100).toFixed(1)}%                      ║
║    • Target:     ${(order.portfolioWeightImpact.targetWeight * 100).toFixed(1)}%                      ║
║    • Post-Trade: ${(order.portfolioWeightImpact.newWeight * 100).toFixed(1)}%                      ║
╠═════════════════════════════════════════════╣
║ 💡 Reason:                                  ║
║    ${order.reason.padEnd(41)} ║
╚═════════════════════════════════════════════╝`;

    if (isMock) {
      console.log('\n📱 [Telegram Mock Notification Sent]');
      console.log(textMsg);
      return true;
    }

    // Real Telegram Bot API Call
    try {
      const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
      const htmlMsg = `
<b>${order.action === 'BUY' ? '🚨 BUY' : '⚠️ SELL'} RECOMMENDATION</b>
───────────────────
<b>Asset:</b> <code>${order.symbol}</code>
<b>Account:</b> ${order.accountType}
<b>Quantity:</b> ${order.quantity}
<b>Price:</b> $${order.price.toFixed(2)}
<b>Estimated Cost:</b> $${order.estimatedCost.toFixed(2)}
───────────────────
<b>Weight Allocation:</b>
• Current: ${(order.portfolioWeightImpact.currentWeight * 100).toFixed(1)}%
• Target: ${(order.portfolioWeightImpact.targetWeight * 100).toFixed(1)}%
• Post-Trade: ${(order.portfolioWeightImpact.newWeight * 100).toFixed(1)}%
───────────────────
<b>Reason:</b> <i>${order.reason}</i>
      `.trim();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: htmlMsg,
          parse_mode: 'HTML'
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram API returned status ${response.status}`);
      }

      console.log('✅ Alert successfully sent to Telegram channel.');
      return true;
    } catch (error) {
      console.error(`❌ Failed to send Telegram alert: ${(error as Error).message}`);
      // Fallback log to console
      console.log('📱 [Notification Fail Fallback Console Print]\n', textMsg);
      return false;
    }
  }

  /**
   * Send a system status/diagnostic message (e.g. startup, token issues)
   */
  async sendSystemAlert(message: string): Promise<boolean> {
    const isMock = config.simulationMode || config.telegramBotToken === 'mock_telegram_bot_token';
    const logPrefix = '🤖 [System Status]';

    if (isMock) {
      console.log(`${logPrefix} ${message}`);
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: `⚙️ <b>Tradelah Status Alert</b>\n\n${message}`,
          parse_mode: 'HTML'
        })
      });
      return true;
    } catch (error) {
      console.error(`❌ Failed to send system alert: ${(error as Error).message}`);
      return false;
    }
  }
}
