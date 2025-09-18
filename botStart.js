require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { firestore, admin } = require("./firebase");

const TELEGRAM_BOT_TOKEN = "8140480108:AAF0mLsV-QrcJKNfIxggRPOknRoNd6UwKOU";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

// Bot instance (no polling)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const miniAppUrl = "https://www.clashwarriors.tech/";
const imageUrl =
  "https://adorable-fudge-c73118.netlify.app/assets/social/test.png";
const description = `
🎮 *Welcome to Clash Warriors!*

Clash Warriors is a real-time multiplayer Web3 battle game built on TON — fully inside Telegram!

⚔️ *How to Play:*  
- Assemble your team of heroes  
- Battle other players in skill-based PvP fights  
- Complete daily missions & unlock new heroes  
- Join ranked leagues and climb leaderboards  

💰 *How to Earn:*  
- Win battles to earn in-game coins  
- Convert coins to $WARS tokens on TON blockchain  
- Participate in seasonal tournaments with real rewards  
- Refer friends for bonus rewards  

🚀 *Airdrop & Special Offers:*  
Stay tuned for exclusive airdrops and events announced via this bot! Use referral links to boost your earnings and unlock rare heroes.

Ready to start? Tap *Start Game* below!
`;

// /start command handler
async function handleStartCommand(msg, match) {
  const chatId = msg.chat.id.toString();
  const referrerId = match[1] ? match[1].trim() : null;
  const newUserId = msg.from.id.toString();

  try {
    const userRef = firestore.collection("users").doc(newUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        firstName: msg.from.first_name || "",
        lastName: msg.from.last_name || "",
        referredBy: referrerId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        coins: 0,
      });
    } else if (referrerId && !userDoc.data().referredBy) {
      await userRef.update({ referredBy: referrerId });
    }

    // Handle referrals
    if (referrerId && referrerId !== newUserId) {
      const inviterRef = firestore.collection("users").doc(referrerId);
      const friendDoc = await inviterRef
        .collection("friends")
        .doc(newUserId)
        .get();
      if (!friendDoc.exists) {
        await inviterRef
          .collection("friends")
          .doc(newUserId)
          .set({
            firstName: msg.from.first_name || "",
            lastName: msg.from.last_name || "",
            invitedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

        const batch = firestore.batch();
        batch.update(userRef, {
          coins: admin.firestore.FieldValue.increment(100000),
        });
        batch.update(inviterRef, {
          coins: admin.firestore.FieldValue.increment(100000),
        });
        await batch.commit();
      }
    }

    const opts = {
      parse_mode: "Markdown",
      caption: description.slice(0, 1024), // ensure max 1024 chars
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Start Game", web_app: { url: miniAppUrl } }],
          [
            {
              text: "📢 Join Announcement Channel",
              url: "https://t.me/clash_warriors_announcement",
            },
          ],
        ],
      },
    };

    await bot.sendPhoto(chatId, imageUrl, opts);
  } catch (err) {
    console.error("❌ Telegram /start error:", err);
    bot.sendMessage(chatId, description, { parse_mode: "Markdown" });
  }
}

// Webhook handler to plug into Express
async function telegramWebhookHandler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    const update = req.body;
    if (update.message && update.message.text) {
      const match = update.message.text.match(/^\/start(?:\s(.*))?$/);
      if (match) await handleStartCommand(update.message, match);
    }
    await bot.processUpdate(update);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Telegram webhook error:", error);
    res.status(500).send("Error");
  }
}

module.exports = { telegramWebhookHandler };
