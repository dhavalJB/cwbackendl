require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { firestore, admin } = require("./firebase");
const pool = require("./db");

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8140480108:AAF0mLsV-QrcJKNfIxggRPOknRoNd6UwKOU";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

// Bot instance (no polling)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const miniAppUrl = "https://play.clashwarriors.tech/";
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
  const newUserId = msg.from.id.toString();
  const referrerId = match[1] ? match[1].trim() : null; // partner name or referral userId

  let referrerData = null;
  let isPartner = false;
  let partnerCoins = 1500000; // default for partner user

  try {
    // 1️⃣ Determine if this is a partner/collab
    if (referrerId && isNaN(referrerId)) {
      // text = partner name
      isPartner = true;
      referrerData = {
        name: referrerId,
      };
    } else if (referrerId && !isNaN(referrerId)) {
      // numeric = referral userId
      const referrerDoc = await firestore
        .collection("users")
        .doc(referrerId)
        .get();
      if (referrerDoc.exists) {
        const rd = referrerDoc.data();
        referrerData = {
          id: referrerId,
          first_name: (rd.first_name ?? rd.firstName ?? "").toString(),
          last_name: (rd.last_name ?? rd.lastName ?? "").toString(),
        };
      }
    }

    // 2️⃣ Fetch new user
    const userRef = firestore.collection("users").doc(newUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user
      let initialCoins = 1000000; // default new user coins

      if (isPartner) {
        initialCoins = partnerCoins; // partner user gets 1.5M
        try {
          await pool.query(
            `UPDATE partners
       SET users_joined = users_joined + 1
       WHERE name = $1`,
            [referrerId] // partner name, e.g., 'kalkiverse'
          );
          console.log(`✅ Partner ${referrerId} users_joined incremented`);
        } catch (err) {
          console.error("❌ Failed to update partner users_joined:", err);
        }
      } else if (referrerData && referrerData.id) {
        initialCoins = 1000000; // referral user gets 1M
      }

      await userRef.set({
        first_name: msg.from.first_name || "",
        last_name: msg.from.last_name || "",
        referredBy: referrerData || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        coins: initialCoins,
      });
    } else {
      // Existing user
      const currentRef = userDoc.data().referredBy;
      if (referrerData && (!currentRef || !currentRef.id) && !isPartner) {
        await userRef.update({ referredBy: referrerData });
      }

      // optional: fix name fields
      const updates = {};
      if (!userDoc.data().first_name && userDoc.data().firstName)
        updates.first_name = userDoc.data().firstName;
      if (!userDoc.data().last_name && userDoc.data().lastName)
        updates.last_name = userDoc.data().lastName;
      if (Object.keys(updates).length) await userRef.update(updates);
    }

    // 3️⃣ Handle referral reward (only for numeric referrer)
    if (referrerData && referrerData.id && referrerId !== newUserId) {
      const inviterRef = firestore.collection("users").doc(referrerId);
      const friendDoc = await inviterRef
        .collection("friends")
        .doc(newUserId)
        .get();

      if (!friendDoc.exists) {
        // Inviter gets coins + lastUpdate
        const batch = firestore.batch();

        batch.update(userRef, {
          coins: admin.firestore.FieldValue.increment(1000000), // new user bonus
        });

        batch.update(inviterRef, {
          coins: admin.firestore.FieldValue.increment(1000000), // inviter bonus
          lastUpdate: admin.firestore.FieldValue.serverTimestamp(), // activity tracker
        });

        // save friends mapping
        batch.set(inviterRef.collection("friends").doc(newUserId), {
          id: newUserId,
          first_name: msg.from.first_name || "",
          last_name: msg.from.last_name || "",
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.set(userRef.collection("friends").doc(referrerId), {
          id: referrerId,
          first_name: referrerData.first_name,
          last_name: referrerData.last_name,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();

        // Notify inviter
        await bot.sendMessage(
          referrerId,
          `🎉 You just invited ${
            msg.from.first_name || referrerData.first_name
          }! Both of you received 1,000,000 coins.`
        );
      }
    }

    // 4️⃣ Send welcome image + buttons
    const opts = {
      parse_mode: "Markdown",
      caption: description.slice(0, 1024),
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
    // fallback
    await bot.sendMessage(chatId, description, {
      parse_mode: "Markdown",
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
    });
  }
}

async function handleFriendlyBattle(msg, match) {
  const chatId = msg.chat.id.toString();
  const payload = match[1]; // this will be like 'friendly_ABC123'
  const matchCode = payload.replace(/^friendly_/, "");

  try {
    // 1️⃣ Save friendly invite acceptance to Firestore
    const friendlyRef = firestore.collection("friendlyQueue").doc(matchCode);
    const doc = await friendlyRef.get();

    if (!doc.exists) {
      // First time accepting this match
      await friendlyRef.set({
        player2: chatId, // this user
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Update player2 if not already set
      const data = doc.data();
      if (!data.player2) {
        await friendlyRef.update({
          player2: chatId,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // 2️⃣ Notify user
    await bot.sendMessage(
      chatId,
      `⚔️ You joined friendly battle: ${matchCode}\nTap below to start playing!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 Start Battle",
                web_app: {
                  url: `https://play.clashwarriors.tech/tournament/${matchCode}`,
                },
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("❌ Friendly battle error:", err);
    await bot.sendMessage(
      chatId,
      "❌ Could not join friendly battle. Try again later."
    );
  }
}

// Send-invite handler
async function sendInviteHandler(req, res) {
  const { fromUser, toUsername, matchCode } = req.body;
  try {
    const usersRef = firestore.collection("users");
    const snapshot = await usersRef.where("username", "==", toUsername).get();

    if (snapshot.empty)
      return res.json({
        success: false,
        error: "Player must start the bot first.",
      });

    const targetChatId = snapshot.docs[0].data().userId;

    await bot.sendMessage(
      targetChatId,
      `⚔️ ${fromUser} has invited you to a friendly battle!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 Start Game",
                web_app: {
                  url: `https://play.clashwarriors.tech/tournament/${matchCode}`,
                },
              },
            ],
          ],
        },
      }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, error: err.message });
  }
}

// Webhook handler for Express
async function telegramWebhookHandler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const update = req.body;
    if (update.message && update.message.text) {
      const match = update.message.text.match(/^\/start(?:\s(.*))?$/);
      if (match) {
        const payload = match[1];

        if (payload?.startsWith("friendly_")) {
          // Handle friendly battle
          await handleFriendlyBattle(update.message, match);
        } else {
          // Normal /start flow (referrals, welcome)
          await handleStartCommand(update.message, match);
        }
      }
    }

    await bot.processUpdate(update);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Telegram webhook error:", error);
    res.status(500).send("Error");
  }
}

module.exports = { telegramWebhookHandler, sendInviteHandler };
