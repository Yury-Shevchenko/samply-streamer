const mongoose = require("mongoose");
const moment = require("moment");
const Bot = mongoose.model("Bot");
const Message = mongoose.model("Message");
const TextCleaner = require("text-cleaner");
const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet(
  "346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz",
  10
);

const RssFeedEmitter = require("rss-feed-emitter");
const feeder = new RssFeedEmitter({ skipFirstLoad: true });

const { OpenAI } = require("openai");
const openaiKey = process.env.OPENAI_TOKEN;

// Initialize the chatGPT
const openai = new OpenAI({
  apiKey: openaiKey,
});

// Samply notification
const url = "https://samply.uni-konstanz.de/api/notify";

// Samply function to send the POST request to activate the notification
async function postData({ url, group, messageId }) {
  const samplySpec = {
    projectID: process.env[`SAMPLY_PROJECT_ID_${group}`],
    groupID: process.env[`SAMPLY_GROUP_ID_${group}`],
    token: process.env[`SAMPLY_TOKEN_${group}`],
    title: process.env[`SAMPLY_TITLE_${group}`],
    message: process.env[`SAMPLY_MESSAGE_${group}`],
    participantID: "",
    expireIn: process.env.SAMPLY_EXPIRE_IN,
  };
  const timestamp = Date.now();
  const data = {
    ...samplySpec,
    url: `${process.env.SAMPLY_SURVEY_URL}${messageId}&t=${timestamp}`,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return response;
}

async function processMessage({ msg, group }) {
  const bots = await Bot.find(
    { title: process.env[`BOT_TITLE_${group}`] },
    { _id: 1, rules: 1, sent: 1 }
  ).limit(1);

  let bot;
  if (bots.length === 0) {
    bot = new Bot({
      title: process.env[`BOT_TITLE_${group}`],
      rules: {
        maxPerSlot: process.env.BOT_MAX_PER_SLOT,
        slots: [
          { id: "09001300", start: 900, end: 1300 },
          { id: "13001700", start: 1300, end: 1700 },
          { id: "17002100", start: 1700, end: 2100 },
        ],
        date_start: moment("2024-02-12"),
        date_end: moment("2024-05-12"),
      },
      sent: {},
    });
    await bot.save();
  } else {
    bot = bots[0];
  }

  const textTitle = msg?.title || "";
  const textSummary = msg?.summary || msg?.description || "";

  if (!textSummary) {
    return;
  }

  const rawText = `${textTitle}. ${textSummary}`;

  const textOriginal = TextCleaner(rawText).stripHtml().condense().valueOf();

  const messages = await Message.find(
    { $or: [{ messageId: msg.message_id }, { textOriginal: textOriginal }] },
    { _id: 1 }
  ).limit(1);

  if (messages.length === 0 && textOriginal) {
    // check the rules of the bot
    const { rules, sent } = bot;
    // get the current date and time
    const curTimestamp = moment();
    const curDate = curTimestamp.format("YYYYMMDD");
    const curTime = curTimestamp.format("HHmm");

    const timeperiods = rules.slots.filter((slot) => {
      return slot.start <= parseInt(curTime) && slot.end >= parseInt(curTime);
    });

    // if the notification is outside the allowed time interval
    if (timeperiods.length === 0) {
      return;
    }

    const timeperiod = timeperiods[0];

    if (!bot.sent) {
      bot.sent = {};
    }
    if (!bot.sent[curDate]) {
      bot.sent[curDate] = {};
    }
    bot.sent[curDate][timeperiod.id] =
      bot.sent[curDate][timeperiod.id] + 1 || 1;

    // if the number of already sent notifications is below the limit
    if (bot.sent[curDate][timeperiod.id] <= rules.maxPerSlot) {
      const messageId = nanoid(7);

      // prompt for ChatGPT
      const prompt = process.env.OPENAI_PROMPT;
      let chatCompletion, textModifiedTrue, textModifiedFake;
      try {
        chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: `${prompt}: ${textOriginal}` }],
          model: process.env.OPENAI_MODEL,
        });
        const content = chatCompletion.choices[0].message.content;
        const breakpoint = /\n+/;
        [textModifiedTrue, textModifiedFake] = content.split(breakpoint);
      } catch (error) {
        console.log("Error with ChatGPT on ", new Date());
        console.log({ error });
      }

      // send Samply notification
      const samplyResult = await postData({
        url,
        group,
        messageId,
      });

      // save the message
      const message = await new Message({
        bot: bot._id,
        messageId: messageId,
        msg: msg,
        textOriginal: textOriginal,
        textModifiedTrue: textModifiedTrue,
        textModifiedFake: textModifiedFake,
        openAIPostResult: chatCompletion,
        samplyPostResult: {
          status: samplyResult?.status,
          statusText: samplyResult?.statusText,
        },
        group: group,
      }).save();

      // update session
      await Bot.findOneAndUpdate(
        { _id: bot._id },
        {
          sent: bot.sent,
          $push: { messages: message?._id },
        },
        {}
      ).exec();
    }
  }
}

feeder.add({
  url: [process.env.RSS_URL_ENGLISH, process.env.RSS_URL_GERMAN],
  refresh: 60000,
});

feeder.on("new-item", function (item) {
  if (item?.meta?.link === process.env.RSS_URL_ENGLISH) {
    processMessage({ msg: item, group: "ENGLISH" });
  }
  if (item?.meta?.link === process.env.RSS_URL_GERMAN) {
    processMessage({ msg: item, group: "GERMAN" });
  }
});

module.exports = feeder;
