// sendRandomMessages.js
require("dotenv").config();
const { bot } = require("./botStart"); // Your bot instance
const pool = require("./db"); // Make sure db exports the pool object
const fs = require("fs");
const path = require("path");

// Load JSON messages
const messages = JSON.parse(
  fs.readFileSync(path.join(__dirname, "message.json"), "utf-8")
);

async function sendMessagesToAllUsers() {
  try {
    // 1️⃣ Get all userIds and timezones
    const { rows: users } = await pool.query(
      "SELECT user_id FROM user_timezones"
    );

    for (const user of users) {
      const userId = user.user_id;

      // Random message
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];

      try {
        await bot.sendMessage(userId, randomMsg.text, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: randomMsg.button, web_app: { url: randomMsg.url } }],
            ],
          },
        });
        // small delay to respect Telegram rate limit
        await new Promise((res) => setTimeout(res, 1200));
      } catch (err) {
        // If user blocked bot, remove from DB
        if (
          err.response &&
          (err.response.statusCode === 403 ||
            err.response.description?.includes("blocked"))
        ) {
          console.log(`User ${userId} blocked bot, removing from DB`);
          await pool.query("DELETE FROM user_timezones WHERE user_id = $1", [
            userId,
          ]);
        } else {
          console.error(`❌ Error sending message to ${userId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error sending messages:", err);
  }
}

module.exports = { sendMessagesToAllUsers };
