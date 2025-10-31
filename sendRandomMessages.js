const fs = require("fs");
const { bot } = require("./botStart");
const pool = require("./db").pool;

// Load JSON messages
const messages = JSON.parse(fs.readFileSync("./messages.json"));

// Batch size to avoid hitting Telegram limits
const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds

async function sendMessagesToAllUsers() {
  try {
    const { rows: users } = await pool.query(
      "SELECT user_id FROM user_timezones"
    );

    console.log(`📢 Sending messages to ${users.length} users`);

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (user) => {
          const userId = user.user_id;

          // Pick a random message
          const msg = messages[Math.floor(Math.random() * messages.length)];

          try {
            await bot.sendMessage(userId, msg.text, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: msg.buttonText,
                      web_app: { url: "https://play.clashwarriors.tech/" },
                    },
                  ],
                ],
              },
            });
            console.log(`✅ Message sent to ${userId}`);
          } catch (err) {
            // User blocked bot or other error
            console.error(`❌ Failed for ${userId}:`, err.response?.body || err.message);

            if (err.response?.body?.description?.includes("bot was blocked")) {
              console.log(`❌ Removing blocked user: ${userId}`);
              await pool.query("DELETE FROM user_timezones WHERE user_id = $1", [userId]);
            }
          }
        })
      );

      // Wait before next batch
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }

    console.log("📢 All messages sent.");
  } catch (err) {
    console.error("❌ Error sending messages:", err);
  }
}

// Export function to call elsewhere
module.exports = { sendMessagesToAllUsers };
