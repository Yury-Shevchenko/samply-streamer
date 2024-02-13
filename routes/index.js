const express = require("express");
const router = express.Router();

const appController = require("../controllers/appController");

router.get("/", appController.mainPage);
router.get("/messages/:id", appController.getMessage);

module.exports = router;
