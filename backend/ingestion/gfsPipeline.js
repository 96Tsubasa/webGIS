const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const BASE_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl";

// ====== CONFIG ======
const MAX_FORECAST_HOUR = 72;
const FORECAST_STEP = 1;
const MAX_RUNS_TO_KEEP = 3;
const RETENTION_DAYS = 3;

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

function formatCompact(date) {
  const y = date.getUTCFullYear();

  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");

  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");

  return `${y}${m}${d}T${h}${min}${s}`;
}

function parseTimestampFromFilename(fileName) {

  const match =
    fileName.match(/(\d{8}T\d{6})/);

  if (!match) return null;

  const ts = match[1];

  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);

  const hour = ts.slice(9, 11);
  const minute = ts.slice(11, 13);
  const second = ts.slice(13, 15);

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  );
}

// ====== CLEANUP ======

async function cleanupOldData() {

  const tifDir = path.join(DATA_DIR, "geotiff");
  const gribDir = path.join(DATA_DIR, "grib");

  const now = Date.now();

  const maxAge =
    RETENTION_DAYS * 24 * 3600 * 1000;

  if (!fs.existsSync(tifDir)) return;

  const tifFiles = fs
    .readdirSync(tifDir)
    .filter(f => f.endsWith(".tif"));

  for (const tifFile of tifFiles) {

    const fileDate =
      parseTimestampFromFilename(tifFile);

    if (!fileDate) continue;

    const age =
      now - fileDate.getTime();

    if (age < maxAge) continue;

    const timestamp =
      tifFile.match(/(\d{8}T\d{6})/)[1];

    const layerName =
      `gfs_${timestamp}`;

    const tifPath =
      path.join(tifDir, tifFile);

    const gribPath =
      path.join(
        gribDir,
        tifFile.replace(".tif", ".grib2")
      );

    console.log(
      `Deleting old data: ${timestamp}`
    );

    // delete geoserver
    await deleteGeoServerLayer(layerName);

    // delete tif
    if (fs.existsSync(tifPath)) {
      fs.unlinkSync(tifPath);
    }

    // delete grib
    if (fs.existsSync(gribPath)) {
      fs.unlinkSync(gribPath);
    }

    console.log(
      `Deleted old dataset: ${timestamp}`
    );
  }
}

async function deleteGeoServerLayer(layerName) {

  const workspace = "weather";

  const url =
    `http://geoserver:8080/geoserver/rest/workspaces/` +
    `${workspace}/coveragestores/${layerName}` +
    `?recurse=true`;

  try {

    await axios.delete(url, {
      auth: {
        username: "admin",
        password: "geoserver"
      }
    });

    console.log(`Deleted GeoServer layer: ${layerName}`);

  } catch (err) {

    console.error(
      `Failed deleting layer ${layerName}:`,
      err.response?.data || err.message
    );

  }
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

    const cmd = `gdal_translate -of GTiff -ot Float32 -a_srs EPSG:4326 "${gribPath}" "${tifPath}"`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error("GDAL error:", stderr);
        return reject(err);
      }
      resolve(tifPath);
    });
  });
}

// ====== PUBLISH ======

async function storeExists(workspace, layerName) {

  const url =
    `http://geoserver:8080/geoserver/rest/workspaces/` +
    `${workspace}/coveragestores/${layerName}.json`;

  try {

    await axios.get(url, {
      auth: {
        username: "admin",
        password: "geoserver"
      }
    });

    return true;

  } catch (err) {

    if (err.response?.status === 404) {
      return false;
    }

    throw err;
  }
}

async function setLayerStyle(layerName) {

  const url =
    `http://geoserver:8080/geoserver/rest/layers/` +
    `weather:${layerName}.json`;

  await axios.put(
    url,
    {
      layer: {
        defaultStyle: {
          name: "temperature_style"
        }
      }
    },
    {
      headers: {
        "Content-Type": "application/json"
      },
      auth: {
        username: "admin",
        password: "geoserver"
      }
    }
  );
}

async function publishGeoTiff(layerName, tifPath) {

  const workspace = "weather";

  try {

    const exists = await storeExists(
      workspace,
      layerName
    );

    if (exists) {

      console.log(
        `Skip existing store: ${layerName}`
      );

      return;
    }

    const url =
      `http://geoserver:8080/geoserver/rest/workspaces/` +
      `${workspace}/coveragestores/${layerName}/file.geotiff`;

    const fileBuffer = fs.readFileSync(tifPath);

    await axios.put(
      url,
      fileBuffer,
      {
        headers: {
          "Content-Type": "image/tiff"
        },
        auth: {
          username: "admin",
          password: "geoserver"
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    console.log(`Published ${layerName}`);

  } catch (err) {

    console.error(
      `Publish failed ${layerName}:`,
      err.response?.data || err.message
    );
  }
}

// ====== MAIN ======

async function run() {
  const date = getStableDate();
  const cycle = getCycle();

  console.log(`\n=== RUN ${date}_${cycle} ===`);

  const gribDir = path.join(DATA_DIR, "grib");
  const tifDir = path.join(DATA_DIR, "geotiff");

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
    const runTime = new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${cycle}:00:00Z`);

    const validTime = new Date(runTime.getTime() + h * 3600 * 1000);

    const fStr = String(h).padStart(3, "0");

    // const fileName = `gfs_${date}_${cycle}_f${fStr}`;
    const timeStr = formatCompact(validTime);
    const fileName = `tmp_${timeStr}`;

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

      console.log(`Publishing f${fStr}...`);
      await publishGeoTiff(
        `gfs_${timeStr}`,
        tifPath
      );

      console.log(`Styling f${fStr}...`);
      await setLayerStyle(`gfs_${timeStr}`);

      console.log(`Done f${fStr}`);
    } catch (err) {
      console.error(`Error f${fStr}:`, err.message);
    }
  }

  await cleanupOldData();

  console.log("=== DONE RUN ===\n");
}

module.exports = { run };