// routes/userDataAdmin.js
const express = require("express");
const router = express.Router();
const { firestore } = require("../firebase");
const fs = require("fs");
const path = require("path");

// ---------------------------
// Load free cards from data/free.json
// ---------------------------
const getFreeCards = () => {
  const filePath = path.join(__dirname, "../data/free.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  const freeData = JSON.parse(rawData);

  const cardsArray = [];
  Object.values(freeData).forEach((cardGroup) => {
    Object.entries(cardGroup).forEach(([cardId, cardData]) => {
      cardsArray.push({
        cardId,
        name: cardData.name,
        image: cardData.image,
        stats: cardData.stats,
        lastUpdate: Date.now(),
      });
    });
  });

  return cardsArray;
};

// ---------------------------
// Helper: Merge cards by cardId, use lastUpdate if exists
// ---------------------------
const mergeCards = (localCards = [], backendCards = []) => {
  const cardMap = {};

  [...localCards, ...backendCards].forEach((card) => {
    const existing = cardMap[card.cardId];
    if (!existing) {
      cardMap[card.cardId] = card;
    } else {
      // If card has lastUpdate, pick latest
      if ((card.lastUpdate || 0) > (existing.lastUpdate || 0)) {
        cardMap[card.cardId] = card;
      }
    }
  });

  return Object.values(cardMap);
};

// ---------------------------
// GET /api/user/:userId
// Fetch user data
// ---------------------------
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const userDoc = await firestore.doc(`users/${userId}`).get();
    if (!userDoc.exists)
      return res.status(404).json({ error: "User not found" });

    res.json(userDoc.data());
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// ---------------------------
// POST /api/user/:userId
// Upload / merge user data
// ---------------------------
// ---------------------------
// POST /api/user/:userId
// Upload / merge user data + cards
// ---------------------------
router.post("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userData, cards: frontendCards } = req.body;

  if (!userData) return res.status(400).json({ error: "userData is required" });

  try {
    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await userRef.get();

    let finalUser = { ...userData, lastUpdate: Date.now() };
    let finalCards = [];

    if (!userSnap.exists) {
      // -------- New user --------
      finalUser = {
        userId,
        first_name: userData.first_name || "",
        last_name: userData.last_name || "",
        username: userData.username || "",
        photo_url: userData.photo_url || "",
        coins: 1000000,
        xp: 0,
        pph: 1500,
        level: 1,
        streak: 0,
        tutorialDone: false,
        registration_timestamp: new Date().toISOString(),
        lastUpdate: Date.now(),
      };

      // Get free cards from JSON
      finalCards = getFreeCards();

      // Save user + free cards in batch
      const batch = firestore.batch();
      batch.set(userRef, finalUser);

      finalCards.forEach((card) => {
        const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
        batch.set(cardRef, card);
      });

      await batch.commit();

      return res.json({
        success: true,
        message: "New user created with free cards",
        data: finalUser,
        cards: finalCards,
      });
    } else {
      // -------- Existing user --------
      const backendUser = userSnap.data();

      // Merge user data based on lastUpdate
      if ((backendUser.lastUpdate || 0) > (userData.lastUpdate || 0)) {
        finalUser = backendUser;
      } else {
        finalUser.lastUpdate = Date.now();
      }

      // Fetch existing cards from backend
      const cardsSnap = await firestore
        .collection(`users/${userId}/cards`)
        .get();
      const backendCards = [];
      cardsSnap.forEach((doc) =>
        backendCards.push({ cardId: doc.id, ...doc.data() })
      );

      // Merge cards: frontend + backend
      finalCards = mergeCards(frontendCards || [], backendCards);

      // Batch write user + merged cards
      const batch = firestore.batch();
      batch.set(userRef, finalUser, { merge: true });

      finalCards.forEach((card) => {
        const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
        batch.set(
          cardRef,
          { ...card, lastUpdate: Date.now() },
          { merge: true }
        );
      });

      await batch.commit();

      return res.json({
        success: true,
        message: "User data updated and cards merged",
        data: finalUser,
        cards: finalCards,
      });
    }
  } catch (err) {
    console.error("Error uploading user data:", err);
    res.status(500).json({ error: "Failed to upload user data" });
  }
});

// ---------------------------
// GET /api/user-cards/:userId
// Fetch user cards
// ---------------------------
router.get("/user-cards/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const cardsSnap = await firestore.collection(`users/${userId}/cards`).get();
    const cards = [];
    cardsSnap.forEach((doc) => cards.push({ cardId: doc.id, ...doc.data() }));
    res.json(cards);
  } catch (err) {
    console.error("Error fetching user cards:", err);
    res.status(500).json({ error: "Failed to fetch user cards" });
  }
});

// ---------------------------
// POST /api/user-cards/:userId
// Upload / merge user cards
// ---------------------------
router.post("/user-cards/:userId", async (req, res) => {
  const { userId } = req.params;
  const { cards } = req.body;

  if (!cards || !Array.isArray(cards)) {
    return res.status(400).json({ error: "cards array is required" });
  }

  try {
    const batch = firestore.batch();

    for (const card of cards) {
      const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
      const cardSnap = await cardRef.get();

      if (
        !cardSnap.exists ||
        (card.lastUpdate || 0) > (cardSnap.data().lastUpdate || 0)
      ) {
        batch.set(cardRef, { ...card, lastUpdate: Date.now() });
      }
    }

    await batch.commit();
    res.json({ success: true, message: "Cards uploaded successfully" });
  } catch (err) {
    console.error("Error uploading user cards:", err);
    res.status(500).json({ error: "Failed to upload user cards" });
  }
});

// ---------------------------
// POST /api/manual-sync/:userId
// IndexedDB → Backend single-sync
// ---------------------------
router.post("/manual-sync/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userData, cards } = req.body;

  if (!userData) return res.status(400).json({ error: "userData is required" });

  try {
    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    let finalUser = { ...userData, lastUpdate: Date.now() };

    if (userSnap.exists) {
      const backendUser = userSnap.data();
      if ((backendUser.lastUpdate || 0) > (userData.lastUpdate || 0)) {
        finalUser = backendUser;
      }
    }

    await userRef.set(finalUser, { merge: true });

    // Merge cards if included
    if (cards && Array.isArray(cards) && cards.length > 0) {
      const backendCardsSnap = await firestore
        .collection(`users/${userId}/cards`)
        .get();
      const backendCards = [];
      backendCardsSnap.forEach((doc) =>
        backendCards.push({ cardId: doc.id, ...doc.data() })
      );

      const mergedCards = mergeCards(cards, backendCards);
      const batch = firestore.batch();
      mergedCards.forEach((card) => {
        const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
        batch.set(cardRef, { ...card, lastUpdate: Date.now() });
      });
      await batch.commit();
    }

    res.json({
      success: true,
      message: "Manual sync completed",
      data: finalUser,
    });
  } catch (err) {
    console.error("Error during manual sync:", err);
    res.status(500).json({ error: "Manual sync failed" });
  }
});

// ---------------------------
// POST /api/user/recover/:userId
// Recover missing starter cards if user exists but has no cards
// ---------------------------
router.post("/user/recover/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const cardsSnap = await firestore.collection(`users/${userId}/cards`).get();
    if (!cardsSnap.empty) {
      return res.json({
        success: true,
        message: "User already has cards, recovery not needed",
      });
    }

    // 🆓 Load default cards from free.json
    const freeCards = getFreeCards();

    // Batch upload
    const batch = firestore.batch();
    freeCards.forEach((card) => {
      const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
      batch.set(cardRef, { ...card, recovered: true, lastUpdate: Date.now() });
    });
    await batch.commit();

    res.json({
      success: true,
      message: "Missing cards recovered successfully",
      recoveredCards: freeCards.length,
      cards: freeCards,
    });
  } catch (err) {
    console.error("Error during user recovery:", err);
    res.status(500).json({ error: "Failed to recover user cards" });
  }
});


module.exports = { userDataAdminRoutes: router };
