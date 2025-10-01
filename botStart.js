require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { firestore, admin } = require("./firebase");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8140480108:AAF0mLsV-QrcJKNfIxggRPOknRoNd6UwKOU";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

// Bot instance (no polling)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const miniAppUrl = "https://play.clashwarriors.tech/";
const imageUrl = "https://adorable-fudge-c73118.netlify.app/assets/social/test.png";
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
  const newUserId = msg.from.id.toString();
  const referrerId = match[1] ? match[1].trim() : null;

  let referrerData = null;

  try {
    // 1️⃣ Fetch referrer info if exists
    if (referrerId) {
      const referrerDoc = await firestore.collection("users").doc(referrerId).get();
      if (referrerDoc.exists) {
        referrerData = {
          id: referrerId,
          firstName: referrerDoc.data().firstName || "",
          lastName: referrerDoc.data().lastName || "",
        };
      }
    }

    // 2️⃣ Fetch new user
    const userRef = firestore.collection("users").doc(newUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create new user with referredBy map
      await userRef.set({
        firstName: msg.from.first_name || "",
        lastName: msg.from.last_name || "",
        referredBy: referrerData || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        coins: 1000000,
      });
    } else if (referrerData && !userDoc.data().referredBy) {
      await userRef.update({ referredBy: referrerData });
    }

    // 3️⃣ Handle referral logic
    if (referrerData && referrerId !== newUserId) {
      const inviterRef = firestore.collection("users").doc(referrerId);
      const friendDoc = await inviterRef.collection("friends").doc(newUserId).get();

      if (!friendDoc.exists) {
        // Inviter's friends collection: add new user
        await inviterRef.collection("friends").doc(newUserId).set({
          id: newUserId,
          firstName: msg.from.first_name || "",
          lastName: msg.from.last_name || "",
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // New user's friends collection: add inviter
        await userRef.collection("friends").doc(referrerId).set({
          id: referrerId,
          firstName: referrerData.firstName,
          lastName: referrerData.lastName,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 4️⃣ Grant referral coins
        const batch = firestore.batch();
        batch.update(userRef, { coins: admin.firestore.FieldValue.increment(1000000) });
        batch.update(inviterRef, { coins: admin.firestore.FieldValue.increment(1000000) });
        await batch.commit();

        // Notify inviter
        await bot.sendMessage(
          referrerId,
          `🎉 You just invited ${msg.from.first_name}! Both of you received 1,000,000 coins.`
        );
      }
    }

    // 5️⃣ Send welcome image + inline buttons
    const opts = {
      parse_mode: "Markdown",
      caption: description.slice(0, 1024),
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Start Game", web_app: { url: miniAppUrl } }],
          [{ text: "📢 Join Announcement Channel", url: "https://t.me/clash_warriors_announcement" }],
        ],
      },
    };

    await bot.sendPhoto(chatId, imageUrl, opts);
  } catch (err) {
    console.error("❌ Telegram /start error:", err);

    // Fallback: always send text with buttons
    await bot.sendMessage(chatId, description, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Start Game", web_app: { url: miniAppUrl } }],
          [{ text: "📢 Join Announcement Channel", url: "https://t.me/clash_warriors_announcement" }],
        ],
      },
    });
  }
}

// Webhook handler for Express
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
