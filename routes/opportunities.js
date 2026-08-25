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


const router =
  express.Router();


/* =========================================================
   ALL CAREER OPPORTUNITY ROUTES REQUIRE AUTHENTICATION

   Student public/discovery behavior can still be supported
   through authenticated student accounts.

   We can add a specifically designed public endpoint later
   if AIFT needs logged-out opportunity discovery.
========================================================= */

router.use(auth);


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
