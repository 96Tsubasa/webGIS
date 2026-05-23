const express = require("express");

const router = express.Router();

router.get("/", async (req, res) => {
  const nx = 120;
  const ny = 80;

  const u = [];
  const v = [];

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const angle = x / 15;

      u.push(Math.sin(angle) * 5);

      v.push(Math.cos(angle) * 5);
    }
  }

  res.json({
    header: {
      nx,
      ny,

      lo1: 102,
      la1: 25,

      dx: 0.067,

      dy: 0.067,
    },

    u,
    v,
  });
});

module.exports = router;
