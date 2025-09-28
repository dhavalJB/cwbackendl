// tutorialController.js
const { db } = require("../firebase");

async function setTutorialFlag(req, res) {
  try {
    const { matchId, tutorialActive } = req.body;
    if (!matchId) return res.status(400).send("Missing matchId");

    const matchRef = db.ref(`ongoingBattles/${matchId}`);
    await matchRef.update({ tutorialActive });

    console.log(`[Match ${matchId}] -> Tutorial flag: ${tutorialActive}`);
    res.send({ success: true, tutorialActive });
  } catch (err) {
    console.error("Error setting tutorial flag", err);
    res.status(500).send("Error setting tutorial flag");
  }
}

module.exports = { setTutorialFlag };
