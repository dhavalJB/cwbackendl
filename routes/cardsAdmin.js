// server/cardsAdmin.js
const express = require("express");
const path = require("path");
const router = express.Router();
const fs = require("fs");

// ---------------------------
// GET /api/cards
// Serve all cards from JSON
// ---------------------------
router.get("/cards", async (req, res) => {
  try {
    const filePath = path.join(__dirname, "../data/cards.json");
    const rawData = fs.readFileSync(filePath, "utf-8");
    const allCards = JSON.parse(rawData);

    res.json(allCards);
  } catch (err) {
    console.error("Error serving cards.json:", err);
    res.status(500).json({ error: "Failed to load cards" });
  }
});

// 👇 Add this below POST /user/recover/:userId
router.get("/user/recover/:userId", async (req, res) => {
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

    const freeCards = getFreeCards();

    const batch = firestore.batch();
    freeCards.forEach((card) => {
      const cardRef = firestore.doc(`users/${userId}/cards/${card.cardId}`);
      batch.set(cardRef, { ...card, recovered: true, lastUpdate: Date.now() });
    });
    await batch.commit();

    res.json({
      success: true,
      message: "Missing cards recovered successfully (GET)",
      recoveredCards: freeCards.length,
      cards: freeCards,
    });
  } catch (err) {
    console.error("Error during GET recovery:", err);
    res.status(500).json({ error: "Failed to recover user cards (GET)" });
  }
});


module.exports = { cardsAdminRoutes: router };
