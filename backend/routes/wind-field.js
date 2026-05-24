const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_DIR = "/data/mosaic";

// ===== CACHE =====

const WIND_CACHE = new Map();

const CACHE_TTL = 10 * 60 * 1000; // 10 phút

function getCached(key) {
  const item = WIND_CACHE.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() > item.expiresAt) {
    WIND_CACHE.delete(key);

    return null;
  }

  return item.data;
}

function setCached(key, data) {
  WIND_CACHE.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  });

  if (WIND_CACHE.size > 20) {
    const oldest = WIND_CACHE.keys().next().value;

    WIND_CACHE.delete(oldest);
  }
}

async function loadGeoTiff(filepath) {
  const { fromFile } = await import("geotiff");

  const tiff = await fromFile(filepath);

  const image = await tiff.getImage();

  const raster = await image.readRasters();

  const bbox = image.getBoundingBox();

  return {
    width: image.getWidth(),

    height: image.getHeight(),

    bbox,

    data: raster[0],
  };
}

function buildFilename(time) {
  return (
    new Date(time).toISOString().replace(/[-:]/g, "").replace(".000Z", "") +
    ".tif"
  );
}

function reshape(data, width, height) {
  const rows = [];

  for (let y = 0; y < height; y++) {
    rows.push(Array.from(data.slice(y * width, (y + 1) * width)));
  }

  return rows;
}

router.get("/", async (req, res) => {
  try {
    const { time } = req.query;

    if (!time) {
      return res.status(400).json({
        error: "Missing time parameter",
      });
    }

    const filename = buildFilename(time);

    // ===== CACHE HIT =====

    const cached = getCached(filename);

    if (cached) {
      console.log(`[WIND CACHE HIT] ${filename}`);

      return res.json(cached);
    }

    const uPath = path.join(DATA_DIR, "wind_u", filename);

    const vPath = path.join(DATA_DIR, "wind_v", filename);

    if (!fs.existsSync(uPath) || !fs.existsSync(vPath)) {
      return res.status(404).json({
        error: "Wind field not found",
      });
    }

    const [uTif, vTif] = await Promise.all([
      loadGeoTiff(uPath),
      loadGeoTiff(vPath),
    ]);

    const payload = {
      width: uTif.width,

      height: uTif.height,

      bbox: uTif.bbox,

      u: reshape(uTif.data, uTif.width, uTif.height),

      v: reshape(vTif.data, vTif.width, vTif.height),
    };

    setCached(filename, payload);

    console.log(`[WIND CACHE STORE] ${filename}`);

    res.json(payload);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to load wind field",
    });
  }
});

module.exports = router;
