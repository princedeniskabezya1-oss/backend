const express = require("express");
const router = express.Router();

const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass
} = require("../controllers/classController");

router.get("/", getClasses);
router.get("/:id", getClassById);
router.post("/", createClass);
router.patch("/:id", updateClass);
router.delete("/:id", deleteClass);

module.exports = router;