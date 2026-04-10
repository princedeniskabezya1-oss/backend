const router = require("express").Router();
const {
  getSubmissions,
  getSubmissionById,
  createSubmission,
  updateSubmission,
  deleteSubmission
} = require("../controllers/submissionController");

router.get("/", getSubmissions);
router.get("/:id", getSubmissionById);
router.post("/", createSubmission);
router.patch("/:id", updateSubmission);
router.delete("/:id", deleteSubmission);

module.exports = router;