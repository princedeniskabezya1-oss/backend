const express = require("express");

const auth =
  require("../middleware/auth");

const {
  getOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity
} =
  require("../controllers/opportunityController");

const {
  createCareerHubListing,
  getPartnerDirectory,
  getVerifiedPartnerships
} =
  require("../controllers/careerHubCreateController");


const router =
  express.Router();


/* =========================================================
   VERIFIED PARTNERSHIPS — PUBLIC PROFILE SAFE DATA

   Only active AIFT-approved School ↔ Company relationships
   are exposed by this endpoint.
========================================================= */

router.get(
  "/verified-partnerships",
  getVerifiedPartnerships
);


/* =========================================================
   AUTHENTICATED CAREER HUB
========================================================= */

router.use(auth);


/* =========================================================
   SIMPLE CAREER HUB CREATION

   Shared by School and Employer dashboards. The controller
   normalizes friendly form values and queues AIFT review.
========================================================= */

router.get(
  "/career-hub-directory",
  getPartnerDirectory
);

router.post(
  "/career-hub-create",
  createCareerHubListing
);


/* =========================================================
   COLLECTION
========================================================= */

router.get(
  "/",
  getOpportunities
);


router.post(
  "/",
  createOpportunity
);


/* =========================================================
   SINGLE OPPORTUNITY
========================================================= */

router.get(
  "/:id",
  getOpportunityById
);


router.patch(
  "/:id",
  updateOpportunity
);


router.delete(
  "/:id",
  deleteOpportunity
);


module.exports =
  router;
