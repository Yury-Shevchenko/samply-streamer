const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const messageSchema = new mongoose.Schema({
  created: {
    type: Date,
    default: Date.now,
  },
  bot: {
    type: mongoose.Schema.ObjectId,
    ref: "Bot",
  },
  messageId: String,
  msg: JSON,
  textOriginal: String,
  textModifiedTrue: String,
  textModifiedFake: String,
  imagePrompt: String,
  openAIPostResult: JSON,
  samplyPostResult: JSON,
  group: String,
});

module.exports = mongoose.model("Message", messageSchema);
