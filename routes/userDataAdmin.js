// routes/userDataAdmin.js
const express = require("express");
const router = express.Router();
const { firestore } = require("../firebase");

// ---------------------------
// Fetch user cards
// GET /api/user-cards/:userId
// ---------------------------
router.get("/user-cards/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const cardsRef = firestore.collection(`users/${userId}/cards`);
    const snapshot = await cardsRef.get();
    const cards = [];
    snapshot.forEach((doc) => {
      cards.push({ cardId: doc.id, ...doc.data() });
    });
    res.json(cards);
  } catch (error) {
    console.error("Error fetching user cards:", error);
    res.status(500).json({ error: "Failed to fetch user cards" });
  }
});

// ---------------------------
// Upload user cards
// POST /api/user-cards/:userId
// Body: { cards: [...] }
// ---------------------------
router.post("/user-cards/:userId", async (req, res) => {
  const { userId } = req.params;
  const { cards } = req.body;

  if (!cards || !Array.isArray(cards)) {
    return res.status(400).json({ error: "cards array is required" });
  }

  try {
    const batch = firestore.batch();
    cards.forEach((card) => {
      const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
      batch.set(cardRef, card);
    });
    await batch.commit();
    res.json({ success: true, message: "Cards uploaded successfully" });
  } catch (error) {
    console.error("Error uploading cards:", error);
    res.status(500).json({ error: "Failed to upload cards" });
  }
});

// ---------------------------
// Fetch user data
// GET /api/user/:userId
// ---------------------------
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const userDoc = await firestore.doc(`users/${userId}`).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(userDoc.data());
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// ---------------------------
// Upload user data
// POST /api/user/:userId
// Body: { userData: {...} }
// ---------------------------
router.post("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userData } = req.body;

  if (!userData) {
    return res.status(400).json({ error: "userData is required" });
  }

  try {
    const cleanData = { ...userData, lastUpdate: Date.now() };
    await firestore.doc(`users/${userId}`).set(cleanData, { merge: true });
    res.json({ success: true, message: "User data uploaded successfully" });
  } catch (error) {
    console.error("Error uploading user data:", error);
    res.status(500).json({ error: "Failed to upload user data" });
  }
});

// ---------------------------
// Manual sync from frontend (IndexedDB)
// POST /api/manual-sync/:userId
// Body: { userData: {...} }
// ---------------------------
router.post("/manual-sync/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userData } = req.body;

  if (!userData) {
    return res.status(400).json({ error: "userData is required" });
  }

  try {
    const cleanData = { ...userData, lastUpdate: Date.now() };

    // Upload user main data
    await firestore.doc(`users/${userId}`).set(cleanData, { merge: true });

    // Upload user cards if included
    if (Array.isArray(userData.cards) && userData.cards.length > 0) {
      const batch = firestore.batch();
      userData.cards.forEach((card) => {
        const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
        batch.set(cardRef, card);
      });
      await batch.commit();
    }

    res.json({ success: true, message: "Manual sync completed" });
  } catch (error) {
    console.error("Error during manual sync:", error);
    res.status(500).json({ error: "Manual sync failed" });
  }
});

module.exports = { userDataAdminRoutes: router };
