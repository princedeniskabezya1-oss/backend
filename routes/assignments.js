const router = require("express").Router();
const {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment
} = require("../controllers/assignmentController");

router.get("/", getAssignments);
router.get("/:id", getAssignmentById);
router.post("/", createAssignment);
router.patch("/:id", updateAssignment);
router.delete("/:id", deleteAssignment);

module.exports = router;