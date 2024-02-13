const mongoose = require("mongoose");

// Import environmental variables from variables.env file
require("dotenv").config({ path: "variables.env" });

// Connect to Database and handle bad connections
mongoose.connect(process.env.DATABASE, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.Promise = global.Promise; // Tell Mongoose to use ES6 promises
mongoose.connection.on("error", (err) => {
  console.error(`🙅 🚫 🙅 🚫 🙅 🚫 🙅 🚫 → ${err.message}`);
});

// Import all models
require("./models/Bot");
require("./models/Message");

// Start the app
const app = require("./app");
app.set("port", process.env.PORT || 8080);
const server = app.listen(app.get("port"), () => {
  console.log(`Express running → PORT ${server.address().port}`);
});
