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

const {
  createEmployerOpportunity,
  listCompanyPartnerships,
  createCompanyPartnership,
  updateCompanyPartnershipStatus,
  createEmployerCampusProgram
} =
  require("../controllers/employerCareerHubController");

const {
  applyToCareerOpportunity
} =
  require("../controllers/studentCareerHubController");

const router =
  express.Router();

/* =========================================================
   VERIFIED PARTNERSHIPS — PUBLIC PROFILE SAFE DATA
========================================================= */

router.get(
  "/verified-partnerships",
  getVerifiedPartnerships
);

/* =========================================================
   AUTHENTICATED CAREER HUB
========================================================= */

router.use(auth);

router.get(
  "/career-hub-directory",
  getPartnerDirectory
);

router.post(
  "/career-hub-create",
  createCareerHubListing
);

/* =========================================================
   EMPLOYER CAREER HUB V2
========================================================= */

router.post(
  "/employer-create",
  createEmployerOpportunity
);

router.get(
  "/company-partnerships",
  listCompanyPartnerships
);

router.post(
  "/company-partnerships",
  createCompanyPartnership
);

router.patch(
  "/company-partnerships/:id/status",
  updateCompanyPartnershipStatus
);

router.post(
  "/employer-campus-programs",
  createEmployerCampusProgram
);

/* =========================================================
   STUDENT CAREER HUB V2

   New Employer Career Hub opportunities use this endpoint so
   Student/Talent applications remain attached to the actual
   SchoolOpportunity and the trusted AIFT Review lifecycle.
========================================================= */

router.post(
  "/:id/apply",
  applyToCareerOpportunity
);

/* =========================================================
   PRIVATE PARTNERSHIP WORKSPACE
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
