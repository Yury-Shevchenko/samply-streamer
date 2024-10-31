const cors = require("cors");
const express = require("express");
const routes = require("./routes/index");

const app = express();

app.use(cors());
app.options("*", cors());
app.use("/", routes);

// serve static files from the uploads directory
app.use("/images", express.static("images"));

app.use((req, res, next) => {
  // had to enable for API to work
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// activate rss
const rss = require("./rss_image");

module.exports = app;
