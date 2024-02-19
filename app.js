const cors = require("cors");
const express = require("express");
const routes = require("./routes/index");

const app = express();

app.use(cors());
app.options("*", cors());
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

// rss
const rss = require("./rss");

module.exports = app;
