const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const botSchema = new mongoose.Schema({
  created: {
    type: Date,
    default: Date.now,
  },
  title: String,
  rules: JSON,
  sent: JSON,
  messages: [{ type: mongoose.Schema.ObjectId, ref: "Message" }],
});

module.exports = mongoose.model("Bot", botSchema);
