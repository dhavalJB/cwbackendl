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

module.exports = { cardsAdminRoutes: router };
