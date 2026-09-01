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

const {
  getWorkspace,
  updateAgreement,
  proposeWorkItem,
  respondWorkItem,
  requestMeeting,
  respondMeeting
} =
  require("../controllers/partnershipWorkspaceController");


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
   PRIVATE PARTNERSHIP WORKSPACE

   AIFT first verifies the introduction. While the partnership
   is in review, the School and Company can privately agree on
   scope, propose work and request an AIFT meeting before the
   relationship becomes approved/active/public.
========================================================= */

router.get(
  "/partnership-workspace/:partnershipId",
  getWorkspace
);

router.patch(
  "/partnership-workspace/:partnershipId/agreement",
  updateAgreement
);

router.post(
  "/partnership-workspace/:partnershipId/work-items",
  proposeWorkItem
);

router.patch(
  "/partnership-workspace/:partnershipId/work-items/:itemId/respond",
  respondWorkItem
);

router.post(
  "/partnership-workspace/:partnershipId/meetings",
  requestMeeting
);

router.patch(
  "/partnership-workspace/:partnershipId/meetings/:requestId/respond",
  respondMeeting
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
