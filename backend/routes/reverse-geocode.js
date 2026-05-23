const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { lat, lon } = req.query;

    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "json",
          lat,
          lon,
        },
        headers: {
          "User-Agent": "weather-webgis",
        },
      },
    );

    res.json({
      display_name: response.data.display_name,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Reverse geocoding failed",
    });
  }
});

module.exports = router;
