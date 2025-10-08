// routes/userDataAdmin.js
const express = require("express");
const router = express.Router();
const { firestore } = require("../firebase");

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
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

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
router.post("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userData } = req.body;

  if (!userData) return res.status(400).json({ error: "userData is required" });

  try {
    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    let finalUser = { ...userData, lastUpdate: Date.now() };

    if (userSnap.exists) {
      const backendUser = userSnap.data();
      // Merge: keep latest coins/xp/stats based on lastUpdate
      if ((backendUser.lastUpdate || 0) > (userData.lastUpdate || 0)) {
        finalUser = backendUser;
      } else {
        finalUser.lastUpdate = Date.now();
      }
    }

    await userRef.set(finalUser, { merge: true });
    res.json({ success: true, message: "User data uploaded", data: finalUser });
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

      if (!cardSnap.exists || (card.lastUpdate || 0) > (cardSnap.data().lastUpdate || 0)) {
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
      const backendCardsSnap = await firestore.collection(`users/${userId}/cards`).get();
      const backendCards = [];
      backendCardsSnap.forEach((doc) => backendCards.push({ cardId: doc.id, ...doc.data() }));

      const mergedCards = mergeCards(cards, backendCards);
      const batch = firestore.batch();
      mergedCards.forEach((card) => {
        const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
        batch.set(cardRef, { ...card, lastUpdate: Date.now() });
      });
      await batch.commit();
    }

    res.json({ success: true, message: "Manual sync completed", data: finalUser });
  } catch (err) {
    console.error("Error during manual sync:", err);
    res.status(500).json({ error: "Manual sync failed" });
  }
});

module.exports = { userDataAdminRoutes: router };
