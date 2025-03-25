const mongoose = require("mongoose");
const fs = require("fs");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const moment = require("moment");
const Bot = mongoose.model("Bot");
const Message = mongoose.model("Message");
const sharp = require("sharp");
const TextCleaner = require("text-cleaner");
const { parse } = require("node-html-parser");
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

// Control false alarms (several notifications coming one after the other)
let englishStreamerIsFree = true;
let germanStreamerIsFree = true;

// Samply function to send the POST request to activate the notification
async function postData({ url, group, messageId }) {
  const samplySpec = {
    projectID: process.env[`SAMPLY_PROJECT_ID_${group}`],
    token: process.env[`SAMPLY_TOKEN_${group}`],
    title: process.env[`SAMPLY_TITLE_${group}`],
    message: process.env[`SAMPLY_MESSAGE_${group}`],
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

async function downloadImage(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
}

function parseHTML({ html }) {
  const root = parse(html);
  // Extract the image link using querySelector
  const imageElement = root.querySelector("img");
  const imageSrc = imageElement ? imageElement.getAttribute("src") : null;
  return imageSrc;
}

// Function to resize the image to a square format (1024x1024)
async function resizeImage(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(1792, 1024, { fit: "cover" })
    .toFile(outputPath);
}

async function processMessage({ msg, group }) {
  if (group === "ENGLISH") {
    englishStreamerIsFree = false;
  }
  if (group === "GERMAN") {
    germanStreamerIsFree = false;
  }

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
        date_start: moment("2024-06-09"),
        date_end: moment("2024-08-31"),
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

  let imageURL;
  if (group === "ENGLISH") {
    imageURL = msg?.image?.url;
  } else {
    imageURL = parseHTML({ html: msg?.description });
  }

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
      let chatCompletion, textModifiedTrue, textModifiedFake, imagePrompt;
      try {
        chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: `${prompt}: ${textOriginal}` }],
          model: process.env.OPENAI_MODEL,
        });
        const content = chatCompletion.choices[0].message.content;
        const breakpoint = /\n+/;
        [textModifiedTrue, textModifiedFake, imagePrompt] =
          content.split(breakpoint);
      } catch (error) {
        console.log("Error with ChatGPT on ", new Date());
        console.log({ error });
      }

      // define paths for images
      const downloadedImagePath = `images/raw/${messageId}.png`;
      const resizedImagePath = `images/original/${messageId}.png`;
      const modifiedImagePath = `images/modified/${messageId}.png`;

      if (imageURL) {
        // save existing image
        await downloadImage(imageURL, downloadedImagePath);
        // resize the image
        await resizeImage(downloadedImagePath, resizedImagePath);
      }

      // generate an image
      // const imagePrompt = process.env.OPENAI_IMAGE_PROMPT;
      let b64_json;
      try {
        const response = await openai.images.generate({
          model: "dall-e-3",
          prompt: `${imagePrompt}`,
          n: 1,
          size: "1792x1024", // 1024x1024 or 1024x1792
          response_format: "b64_json",
        });
        b64_json = response.data[0].b64_json;
        // Decode and save the image as a PNG file
        const imageBuffer = Buffer.from(b64_json, "base64");
        const imagePath = modifiedImagePath;
        await fs.writeFile(imagePath, imageBuffer, function (err) {
          if (err) {
            return console.log(err);
          }
        });
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
        imagePrompt: imagePrompt,
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

feeder.on("new-item", async function (item) {
  if (
    item?.meta?.link === process.env.RSS_URL_ENGLISH &&
    englishStreamerIsFree
  ) {
    await processMessage({ msg: item, group: "ENGLISH" });
    englishStreamerIsFree = true;
  }

  if (item?.meta?.link === process.env.RSS_URL_GERMAN && germanStreamerIsFree) {
    await processMessage({ msg: item, group: "GERMAN" });
    germanStreamerIsFree = true;
  }
});

module.exports = feeder;
