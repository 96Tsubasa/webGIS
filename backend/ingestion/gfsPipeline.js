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
  },

  {
    key: "wind_u",

    levelQuery:
      "&lev_10_m_above_ground=on",

    variableQuery:
      "&var_UGRD=on",

    gdalBand: null
  },

  {
    key: "wind_v",

    levelQuery:
      "&lev_10_m_above_ground=on",

    variableQuery:
      "&var_VGRD=on",

    gdalBand: null
  }

];

// ===== TIME =====

async function findLatestCycle() {

  const now = new Date();

  const cycles = ["18", "12", "06", "00"];

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {

    const date = new Date(now);

    date.setUTCDate(
      date.getUTCDate() - dayOffset
    );

    const ymd =
      date.getUTCFullYear() +
      String(date.getUTCMonth() + 1)
        .padStart(2, "0") +
      String(date.getUTCDate())
        .padStart(2, "0");

    for (const cycle of cycles) {

      const testUrl =
        `${BASE_URL}` +
        `?file=gfs.t${cycle}z.pgrb2.0p25.f072` +
        `&lev_2_m_above_ground=on` +
        `&var_TMP=on` +
        `&subregion=` +
        `&leftlon=100` +
        `&rightlon=101` +
        `&toplat=21` +
        `&bottomlat=20` +
        `&dir=%2Fgfs.${ymd}%2F${cycle}%2Fatmos`;

      try {

        const res = await axios.get(testUrl, {
          timeout: 10000,
          responseType: "stream"
        });

        if (res.status === 200) {

          const latestCycle = {
            date: ymd,
            cycle,
            updatedAt: new Date().toISOString()
          };

          return latestCycle;

        }

      } catch (err) {

      }

    }

  }

  throw new Error(
    "No available GFS cycle found"
  );
}

function saveCycle(cycleData) {

  const statePath =
    path.join(
      DATA_DIR,
      "latest_cycle.json"
    );

  fs.writeFileSync(
    statePath,
    JSON.stringify(
      cycleData,
      null,
      2
    )
  );

}

function getSavedCycle() {

  const statePath =
    path.join(
      DATA_DIR,
      "latest_cycle.json"
    );

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {

    return JSON.parse(
      fs.readFileSync(
        statePath,
        "utf8"
      )
    );

  } catch (err) {

    console.error(
      "Failed to read latest_cycle.json:",
      err.message
    );

    return null;

  }

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

// Clear mosaic index files to force GeoServer to reindex on next access
function clearMosaicIndex(variableKey) {
  const dir = getMosaicDir(variableKey);

  for (const file of fs.readdirSync(dir)) {
    if (
      file.startsWith("mosaic.") &&
      file.endsWith(".db")
    ) {
      const fullPath = path.join(dir, file);

      fs.rmSync(
        fullPath,
        { force: true }
      );

      console.log(
        `[${variableKey}] Deleted mosaic index file:`,
        fullPath
      );
    }
  }
}

function cleanupOldFiles(variableKey) {

  const dirs = [
    getGribDir(variableKey),
    getMosaicDir(variableKey)
  ];

  const now = new Date();

  const cutoff =
    now.getTime() -
    3 * 24 * 3600 * 1000;

  for (const dir of dirs) {

    const files =
      fs.readdirSync(dir);

    for (const file of files) {

      const match =
        file.match(
          /^(\d{8}T\d{6})/
        );

      if (!match) continue;

      const ts = match[1];

      const fileDate = new Date(
        ts.slice(0,4) + "-" +
        ts.slice(4,6) + "-" +
        ts.slice(6,8) + "T" +
        ts.slice(9,11) + ":00:00Z"
      );

      if (
        fileDate.getTime() < cutoff
      ) {

        const fullPath =
          path.join(dir, file);

        fs.rmSync(fullPath, {
          force: true
        });

        console.log(
          "Deleted old file:",
          fullPath
        );

      }

    }

  }

}

// ===== DOWNLOAD =====

async function downloadFile(
  url,
  filePath
) {

  fs.rmSync(filePath, { force: true });

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
    fs.rmSync(tifPath, {
      force: true
    });

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

  const latestCycle =
    await findLatestCycle();

  const savedCycle =
    getSavedCycle();

  if (
    savedCycle &&
    savedCycle.date === latestCycle.date &&
    savedCycle.cycle === latestCycle.cycle
  ) {

    console.log(
      "No new GFS cycle. Skip pipeline."
    );

    return;

  }

  console.log(
    `New cycle detected: ${latestCycle.date} ${latestCycle.cycle}z`
  );

  const date =
    latestCycle.date;

  const cycle =
    latestCycle.cycle;

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

    cleanupOldFiles(variable.key);

    // Delete these files when GeoServer is running might cause error loop, manually delete them for now
    // clearMosaicIndex(variable.key);
  }

  await reloadGeoServer();

  saveCycle(latestCycle);

  console.log("DONE");

}

module.exports = { run };