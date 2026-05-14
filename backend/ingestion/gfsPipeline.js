const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const BASE_URL =
  "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl";

const DATA_DIR =
  process.env.DATA_DIR || "/data";

const MAX_FORECAST_HOUR = 72;
const FORECAST_STEP = 1;

// ===== WEATHER VARIABLES =====

const VARIABLES = [

  {
    key: "temperature",

    levelQuery:
      "&lev_2_m_above_ground=on",

    variableQuery:
      "&var_TMP=on",

    gdalBand: null
  },

  {
    key: "precipitation",

    levelQuery:
      "&lev_surface=on",

    variableQuery:
      "&var_APCP=on",

    gdalBand: 1,

    startHour: 1
  }

];

// ===== TIME =====

function getStableDate() {

  const now = new Date();

  now.setUTCDate(
    now.getUTCDate() - 1
  );

  return (
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1)
      .padStart(2, "0") +
    String(now.getUTCDate())
      .padStart(2, "0")
  );
}

function getCycle() {

  const hour =
    new Date().getUTCHours();

  if (hour >= 18) return "18";
  if (hour >= 12) return "12";
  if (hour >= 6) return "06";

  return "00";
}

function formatGeoServerTime(date) {

  const y = date.getUTCFullYear();

  const m =
    String(date.getUTCMonth() + 1)
      .padStart(2, "0");

  const d =
    String(date.getUTCDate())
      .padStart(2, "0");

  const h =
    String(date.getUTCHours())
      .padStart(2, "0");

  return `${y}${m}${d}T${h}0000`;
}

// ===== DIRECTORY HELPERS =====

function getGribDir(variableKey) {

  return path.join(
    DATA_DIR,
    "grib",
    variableKey
  );
}

function getMosaicDir(variableKey) {

  return path.join(
    DATA_DIR,
    "mosaic",
    variableKey
  );
}

function ensureDirs(variableKey) {

  fs.mkdirSync(
    getGribDir(variableKey),
    { recursive: true }
  );

  fs.mkdirSync(
    getMosaicDir(variableKey),
    { recursive: true }
  );
}

function ensureMosaicFiles(variableKey) {

  const mosaicDir =
    getMosaicDir(variableKey);

  const indexerPath =
    path.join(
      mosaicDir,
      "indexer.properties"
    );

  if (!fs.existsSync(indexerPath)) {

    fs.writeFileSync(
      indexerPath,
`TimeAttribute=time
Schema=*the_geom:Polygon,location:String,time:java.util.Date
PropertyCollectors=TimestampFileNameExtractorSPI[timeregex](time)
Caching=false
AbsolutePath=true
CanBeEmpty=true
`
    );

    console.log(
      `[${variableKey}] Created indexer.properties`
    );
  }

  const timeregexPath =
    path.join(
      mosaicDir,
      "timeregex.properties"
    );

  if (!fs.existsSync(timeregexPath)) {

    fs.writeFileSync(
      timeregexPath,
`regex=[0-9]{8}T[0-9]{6}
format=yyyyMMdd'T'HHmmss
`
    );

    console.log(
      `[${variableKey}] Created timeregex.properties`
    );
  }

  const datastorePath =
    path.join(
      mosaicDir,
      "datastore.properties"
    );

  if (!fs.existsSync(datastorePath)) {

    fs.writeFileSync(
      datastorePath,
`SPI=org.geotools.data.h2.H2DataStoreFactory
database=mosaic
dbtype=h2
`
    );

    console.log(
      `[${variableKey}] Created datastore.properties`
    );
  }
}

// ===== DOWNLOAD =====

async function downloadFile(
  url,
  filePath
) {

  if (fs.existsSync(filePath)) {

    console.log(
      "Skip existing:",
      filePath
    );

    return;
  }

  const response = await axios({
    method: "GET",
    url,
    responseType: "stream"
  });

  const writer =
    fs.createWriteStream(filePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {

    writer.on("finish", resolve);

    writer.on("error", reject);

  });
}

// ===== GDAL =====

function convertToTif(
  gribPath,
  tifPath,
  gdalBand = null
) {

  return new Promise((resolve, reject) => {

    if (fs.existsSync(tifPath)) {

      console.log(
        "Skip existing tif:",
        tifPath
      );

      return resolve();
    }

    let cmd =
      `gdal_translate ` +
      `-of GTiff ` +
      `-ot Float32 ` +
      `-a_srs EPSG:4326 `;

    if (gdalBand !== null) {
      cmd += `-b ${gdalBand} `;
    }

    cmd +=
      `"${gribPath}" ` +
      `"${tifPath}"`;

    exec(cmd, (err, stdout, stderr) => {

      if (err) {

        console.error(
          "GDAL error:",
          stderr
        );

        return reject(err);
      }

      resolve();
    });

  });

}

// ===== GEOSERVER =====

async function reloadGeoServer() {

  try {

    await axios.post(
      "http://geoserver:8080/geoserver/rest/reload",
      {},
      {
        auth: {
          username: "admin",
          password: "geoserver"
        }
      }
    );

    console.log(
      "GeoServer reloaded"
    );

  } catch (err) {

    console.error(
      "Reload failed:",
      err.message
    );
  }

}

// ===== VARIABLE PIPELINE =====

async function processVariable(
  variable,
  date,
  cycle,
  bbox
) {

  ensureDirs(variable.key);

  ensureMosaicFiles(variable.key);

  for (
    let h = (variable.startHour || 0);
    h <= MAX_FORECAST_HOUR;
    h += FORECAST_STEP
  ) {

    const runTime =
      new Date(
        `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${cycle}:00:00Z`
      );

    const validTime =
      new Date(
        runTime.getTime() +
        h * 3600 * 1000
      );

    const timeStr =
      formatGeoServerTime(validTime);

    const gribPath =
      path.join(
        getGribDir(variable.key),
        `${timeStr}.grib2`
      );

    const tifPath =
      path.join(
        getMosaicDir(variable.key),
        `${timeStr}.tif`
      );

    const fStr =
      String(h).padStart(3, "0");

    const url =
      `${BASE_URL}?file=gfs.t${cycle}z.pgrb2.0p25.f${fStr}` +
      `${variable.levelQuery}` +
      `${variable.variableQuery}` +
      `&subregion=` +
      `&leftlon=${bbox.leftlon}` +
      `&rightlon=${bbox.rightlon}` +
      `&toplat=${bbox.toplat}` +
      `&bottomlat=${bbox.bottomlat}` +
      `&dir=%2Fgfs.${date}%2F${cycle}%2Fatmos`;

    try {

      console.log(
        `[${variable.key}] Downloading f${fStr}`
      );

      await downloadFile(
        url,
        gribPath
      );

      console.log(
        `[${variable.key}] Converting f${fStr}`
      );

      await convertToTif(
        gribPath,
        tifPath,
        variable.gdalBand
      );

    } catch (err) {

      console.error(
        `[${variable.key}] Error f${fStr}:`,
        err.message
      );

    }

  }

}

// ===== MAIN =====

async function run() {

  const date =
    getStableDate();

  const cycle =
    getCycle();

  const bbox = {
    leftlon: 100.1,
    rightlon: 111.8,
    toplat: 25.6,
    bottomlat: 6.4
  };

  for (const variable of VARIABLES) {

    console.log(
      `========== ${variable.key.toUpperCase()} ==========`
    );

    await processVariable(
      variable,
      date,
      cycle,
      bbox
    );

  }

  await reloadGeoServer();

  console.log("DONE");

}

module.exports = { run };