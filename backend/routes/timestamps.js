const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || "/data";
const TIFF_DIR = path.join(DATA_DIR, "geotiff");

router.get("/", (req, res) => {
  try {
    const files = fs
      .readdirSync(TIFF_DIR)
      .filter(f => f.endsWith(".tif"));

    const result = files
      .map(file => {
        const match = file.match(/(\d{8}T\d{6})/);

        if (!match) return null;

        return {
          file,
          timestamp: match[1],
          layer: `gfs_${match[1]}`
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );

    res.json(result);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;