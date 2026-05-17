const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/", async (req, res) => {

  try {

    const response = await axios.get(
      "http://geoserver:8080/geoserver/wms",
      {
        params: req.query
      }
    );

    res.send(response.data);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

module.exports = router;