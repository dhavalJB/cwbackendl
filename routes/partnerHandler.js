const path = require("path");

const partnersHandler = (req, res) => {
  const { partnerName } = req.params;

  // Construct path to partner HTML
  const partnerHtmlPath = path.join(__dirname, "partners_html", `${partnerName}.html`);

  // Send the HTML file
  res.sendFile(partnerHtmlPath, (err) => {
    if (err) {
      console.error(`Error sending partner page for ${partnerName}:`, err);
      res.status(404).send("Partner page not found");
    }
  });
};

module.exports = { partnersHandler };
