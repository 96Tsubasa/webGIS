const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const BASE_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl";

// ====== CONFIG ======
const MAX_FORECAST_HOUR = 72;
const FORECAST_STEP = 1;
const MAX_RUNS_TO_KEEP = 3;

// luôn dùng /data khi chạy Docker
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");


// ====== TIME ======

function getStableDate() {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);

  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");

  return `${y}${m}${d}`;
}

function getCycle() {
  const hour = new Date().getUTCHours();

  if (hour >= 18) return "18";
  if (hour >= 12) return "12";
  if (hour >= 6) return "06";
  return "00";
}

// ====== PATH ======

function getRunDir(date, cycle) {
  return path.join(DATA_DIR, `${date}_${cycle}`);
}

// ====== CLEANUP ======

function cleanupOldRuns() {
  if (!fs.existsSync(DATA_DIR)) return;

  const entries = fs.readdirSync(DATA_DIR);

  const runs = entries
    .map(name => {
      const fullPath = path.join(DATA_DIR, name);
      if (!fs.statSync(fullPath).isDirectory()) return null;

      return {
        name,
        time: fs.statSync(fullPath).mtime.getTime()
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);

  const toDelete = runs.slice(MAX_RUNS_TO_KEEP);

  toDelete.forEach(dir => {
    const fullPath = path.join(DATA_DIR, dir.name);
    console.log("Deleting old run:", fullPath);
    fs.rmSync(fullPath, { recursive: true, force: true });
  });
}

// ====== DOWNLOAD ======

async function downloadFile(url, filePath) {
  if (fs.existsSync(filePath)) {
    console.log("Skip existing:", filePath);
    return filePath;
  }

  const response = await axios({
    method: "GET",
    url,
    responseType: "stream"
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(filePath));
    writer.on("error", reject);
  });
}

// ====== CONVERT ======

function convertToTif(gribPath, tifPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(tifPath)) {
      console.log("Skip existing tif:", tifPath);
      return resolve(tifPath);
    }

    const cmd = `gdal_translate -of GTiff -b 1 "${gribPath}" "${tifPath}"`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error("GDAL error:", stderr);
        return reject(err);
      }
      resolve(tifPath);
    });
  });
}

// ====== MAIN ======

async function run() {
  const date = getStableDate();
  const cycle = getCycle();

  console.log(`\n=== RUN ${date}_${cycle} ===`);

  const runDir = getRunDir(date, cycle);
  const gribDir = path.join(runDir, "grib");
  const tifDir = path.join(runDir, "geotiff");

  // tạo đúng cấu trúc
  fs.mkdirSync(gribDir, { recursive: true });
  fs.mkdirSync(tifDir, { recursive: true });

  

  const bbox = {
    leftlon: 100.1,
    rightlon: 111.8,
    toplat: 25.6,
    bottomlat: 6.4
  };

  for (let h = 0; h <= MAX_FORECAST_HOUR; h += FORECAST_STEP) {
    const fStr = String(h).padStart(3, "0");

    const fileName = `gfs_${date}_${cycle}_f${fStr}`;
    const gribPath = path.join(gribDir, `${fileName}.grib2`);
    const tifPath = path.join(tifDir, `${fileName}.tif`);

    const url =
      `${BASE_URL}?file=gfs.t${cycle}z.pgrb2.0p25.f${fStr}` +
      `&lev_2_m_above_ground=on` +
      `&var_TMP=on` +
      `&subregion=` +
      `&leftlon=${bbox.leftlon}` +
      `&rightlon=${bbox.rightlon}` +
      `&toplat=${bbox.toplat}` +
      `&bottomlat=${bbox.bottomlat}` +
      `&dir=%2Fgfs.${date}%2F${cycle}%2Fatmos`;

    try {
      console.log(`Downloading f${fStr}...`);
      await downloadFile(url, gribPath);

      console.log(`Converting f${fStr}...`);
      await convertToTif(gribPath, tifPath);

      console.log(`Done f${fStr}`);
    } catch (err) {
      console.error(`Error f${fStr}:`, err.message);
    }
  }

  cleanupOldRuns();

  console.log("=== DONE RUN ===\n");
}

module.exports = { run };