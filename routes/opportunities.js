const router = require("express").Router();
const {
  getOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity
} = require("../controllers/opportunityController");

router.get("/", getOpportunities);
router.get("/:id", getOpportunityById);
router.post("/", createOpportunity);
router.patch("/:id", updateOpportunity);
router.delete("/:id", deleteOpportunity);

module.exports = router;