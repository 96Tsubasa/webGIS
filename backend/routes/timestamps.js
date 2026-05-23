const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || "/data";

router.get("/", (req, res) => {
  try {
    const variable = req.query.variable || "temperature";

    const TIFF_DIR = path.join(DATA_DIR, "mosaic", variable);

    if (!fs.existsSync(TIFF_DIR)) {
      return res.status(404).json({
        error: "Variable not found",
      });
    }

    const files = fs.readdirSync(TIFF_DIR).filter((f) => f.endsWith(".tif"));

    const result = files
      .map((file) => {
        const match = file.match(/^(\d{8}T\d{6})\.tif$/);

        if (!match) return null;

        return {
          file,
          timestamp: match[1],
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
