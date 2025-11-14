// sendRandomMessages.js
require("dotenv").config();
const { bot } = require("./botStart"); // Your Telegram bot instance
const pool = require("./db"); // Make sure db exports the pool object
const fs = require("fs");
const path = require("path");

// Load JSON messages
const messages = JSON.parse(
  fs.readFileSync(path.join(__dirname, "message.json"), "utf-8")
);

// Telegram Mini App URL
const MINI_APP_URL = "https://play.clashwarriors.tech";

// Delay helper to respect Telegram limits
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function sendMessagesToAllUsers() {
  try {
    // 1️⃣ Get all users
    const { rows: users } = await pool.query(
      "SELECT user_id FROM user_timezones"
    );

    console.log(`📤 Sending messages to ${users.length} users...`);

    for (const user of users) {
      const userId = user.user_id;

      // Pick a random message
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];

      try {
        await bot.sendMessage(userId, randomMsg.text, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: randomMsg.buttonText || "Play Now",
                  url: MINI_APP_URL,
                },
              ],
            ],
          },
        });

        // Delay to avoid Telegram flood limits
        await delay(1200);
      } catch (err) {
        // Handle blocked users or other 403 errors
        if (
          err.response &&
          (err.response.statusCode === 403 ||
            err.response.description?.includes("blocked"))
        ) {
          console.log(`🚫 User ${userId} blocked the bot. Removing from DB.`);
          await pool.query(
            "DELETE FROM user_timezones WHERE user_id = $1",
            [userId]
          );
        } else {
          console.error(`❌ Error sending message to ${userId}:`, err.message);
        }
      }
    }

    console.log("✅ Finished sending messages to all users.");
  } catch (err) {
    console.error("❌ Error sending messages:", err);
  }
}

// Optional: function to schedule sending every 3 hours
function scheduleMessages(intervalHours = 6) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`⏰ Scheduling messages every ${intervalHours} hour(s).`);
  setInterval(sendMessagesToAllUsers, intervalMs);
}

module.exports = { sendMessagesToAllUsers, scheduleMessages };
