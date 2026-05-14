const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");
const { run } = require("./ingestion/gfsPipeline");
const timestampsRoute = require("./routes/timestamps");

const app = express();
app.use(cors());

// chạy sau 15 phút mỗi 6 giờ
cron.schedule("15 */6 * * *", async () => {
  console.log("Cron job triggered...");
  await run();
});

// chạy ngay khi start (để test)
(async () => {

  try {

    await run();

  } catch (err) {

    console.error(
      "Initial pipeline failed:",
      err
    );

  }

})();


// Mount route
app.use("/api/timestamps", timestampsRoute);

// Dùng API của moitruongthudo để lấy data về AQI
app.get("/api/aqi", async (req, res) => {
  try {
    const response = await axios.get("https://moitruongthudo.vn/api/site");
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch API" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});