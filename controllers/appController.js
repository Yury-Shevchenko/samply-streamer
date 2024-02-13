const Message = require("../models/Message");

exports.mainPage = async (req, res) => {
  res.send("Hello World!");
};

exports.getMessage = async (req, res) => {
  const message = await Message.findOne({ messageId: req.params.id });
  if (message) {
    res.send({ message });
  } else {
    res.send({});
  }
};
