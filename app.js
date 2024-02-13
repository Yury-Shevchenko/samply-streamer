const express = require("express");
const routes = require("./routes/index");

const app = express();
app.use("/", routes);

app.use((req, res, next) => {
  // had to enable for API to work
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// telegram bot
const bot = require("./bot");

module.exports = app;
