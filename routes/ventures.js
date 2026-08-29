const express =
  require("express");


const mongoose =
  require("mongoose");


const router =
  express.Router();


const Venture =
  require("../models/Venture");


const VentureInterest =
  require("../models/VentureInterest");


const User =
  require("../models/User");


const auth =
  require("../middleware/auth");


/* =========================================================
   CONSTANTS
========================================================= */

const VENTURE_TYPES =
  new Set([
    "student-project",
    "startup",
    "business",
    "research",
    "social-enterprise"
  ]);


const VENTURE_STAGES =
  new Set([
    "idea",
    "research",
    "prototype",
    "testing",
    "pilot",
    "early-revenue",
    "growth"
  ]);


const VENTURE_STATUSES =
  new Set([
    "draft",
    "submitted",
    "active",
    "paused",
    "funded",
    "closed",
    "rejected"
  ]);


const VENTURE_VISIBILITIES =
  new Set([
    "public",
    "aift-only",
    "private"
  ]);


const FUNDING_TYPES =
  new Set([
    "grant",
    "sponsorship",
    "investment-interest",
    "mentorship",
    "pilot",
    "donation"
  ]);


const INTEREST_TYPES =
  new Set([
    "save",
    "follow",
    "grant",
    "sponsorship",
    "mentorship",
    "pilot",
    "investment"
  ]);


/* =========================================================
   HELPERS
========================================================= */

function safeString(
  value,
  maxLength = 5000
){

  return String(
    value ??
    ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}


function normalizeRole(
  user
){

  return String(
    user?.role ||
    ""
  )
    .trim()
    .toLowerCase();

}


function isAdmin(
  user
){

  return (
    normalizeRole(user) ===
    "admin"
  );

}


function isValidId(
  value
){

  return (
    mongoose.Types
      .ObjectId
      .isValid(
        String(
          value ||
          ""
        )
      )
  );

}


function sameId(
  first,
  second
){

  if(
    !first ||
    !second
  ){

    return false;

  }


  return (
    String(
      first?._id ||
      first
    ) ===
    String(
      second?._id ||
      second
    )
  );

}


/* =========================================================
   OWNER PERMISSION
========================================================= */

function canManageVenture(
  user,
  venture
){

  if(
    !user ||
    !venture
  ){

    return false;

  }


  if(
    isAdmin(user)
  ){

    return true;

  }


  return sameId(
    venture.ownerId,
    user._id ||
    user.id
  );

}


/* =========================================================
   SCHOOL VERIFICATION PERMISSION
========================================================= */

function canVerifyVenture(
  user,
  venture
){

  if(
    !user ||
    !venture
  ){

    return false;

  }


  if(
    isAdmin(user)
  ){

    return true;

  }


  if(
    normalizeRole(user) !==
    "school"
  ){

    return false;

  }


  return sameId(
    venture.schoolId,
    user._id ||
    user.id
  );

}


/* =========================================================
   CREATE SAFE SLUG
========================================================= */

function createSlug(
  value
){

  return safeString(
    value,
    140
  )
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      100
    );

}


/* =========================================================
   UNIQUE SLUG
========================================================= */

async function createUniqueSlug(
  title,
  excludeId = null
){

  const base =
    createSlug(title) ||
    "venture";


  let slug =
    base;


  let counter =
    1;


  while(true){

    const query = {
      slug
    };


    if(excludeId){

      query._id = {
        $ne:excludeId
      };

    }


    const exists =
      await Venture.exists(
        query
      );


    if(!exists){

      return slug;

    }


    counter += 1;


    slug =
      `${base}-${counter}`;

  }

}


/* =========================================================
   NORMALIZE STRING ARRAY
========================================================= */

function normalizeStringArray(
  value,
  maxItems = 30,
  maxLength = 80
){

  if(
    !Array.isArray(
      value
    )
  ){

    return [];

  }


  return [
    ...new Set(
      value
        .map(
          item =>
            safeString(
              item,
              maxLength
            )
              .toLowerCase()
        )
        .filter(Boolean)
    )
  ]
    .slice(
      0,
      maxItems
    );

}


/* =========================================================
   NORMALIZE FUNDING TYPES
========================================================= */

function normalizeFundingTypes(
  value
){

  if(
    !Array.isArray(
      value
    )
  ){

    return [];

  }


  return [
    ...new Set(
      value
        .map(
          item =>
            safeString(
              item,
              60
            )
        )
        .filter(
          item =>
            FUNDING_TYPES.has(
              item
            )
        )
    )
  ];

}


/* =========================================================
   POPULATE STANDARD VENTURE
========================================================= */

function populateVenture(
  query
){

  return query
    .populate(
      "ownerId",
      [
        "name",
        "email",
        "role",
        "profileImage",
        "headline",
        "schoolId",
        "linkedSchoolId",
        "aiftVerified"
      ].join(" ")
    )
    .populate(
      "schoolId",
      [
        "name",
        "schoolName",
        "profileImage",
        "aiftVerified"
      ].join(" ")
    )
    .populate(
      "teamMembers.userId",
      [
        "name",
        "profileImage",
        "headline"
      ].join(" ")
    );

}


/* =========================================================
   PUBLIC DISCOVERY
   GET /api/ventures
========================================================= */

router.get(
  "/",
  async (
    req,
    res
  ) => {

    try{

      const {
        type,
        stage,
        industry,
        fundingType,
        q,
        featured,
        schoolId,
        page = 1,
        limit = 24
      } =
        req.query;


      const query = {
        status:"active",
        visibility:"public"
      };


      if(
        type &&
        VENTURE_TYPES.has(
          String(type)
        )
      ){

        query.ventureType =
          String(type);

      }


      if(
        stage &&
        VENTURE_STAGES.has(
          String(stage)
        )
      ){

        query.stage =
          String(stage);

      }


      if(
        industry
      ){

        query.industry = {
          $regex:
            safeString(
              industry,
              100
            ),

          $options:"i"
        };

      }


      if(
        fundingType &&
        FUNDING_TYPES.has(
          String(
            fundingType
          )
        )
      ){

        query.fundingTypes =
          String(
            fundingType
          );

      }


      if(
        schoolId &&
        isValidId(
          schoolId
        )
      ){

        query.schoolId =
          schoolId;

      }


      if(
        String(featured) ===
        "true"
      ){

        query.featured =
          true;

      }


      if(
        safeString(
          q,
          120
        )
      ){

        query.$text = {
          $search:
            safeString(
              q,
              120
            )
        };

      }


      const safePage =
        Math.max(
          1,
          Number(page) ||
          1
        );


      const safeLimit =
        Math.min(
          50,
          Math.max(
            1,
            Number(limit) ||
            24
          )
        );


      const skip =
        (
          safePage -
          1
        ) *
        safeLimit;


      const [
        ventures,
        total
      ] =
        await Promise.all([

          populateVenture(
            Venture.find(
              query
            )
          )
            .sort({
              featured:-1,
              createdAt:-1
            })
            .skip(skip)
            .limit(
              safeLimit
            ),

          Venture.countDocuments(
            query
          )

        ]);


      res.json({
        ventures,
        pagination:{
          page:safePage,
          limit:safeLimit,
          total,
          pages:
            Math.max(
              1,
              Math.ceil(
                total /
                safeLimit
              )
            )
        }
      });

    }catch(error){

      console.error(
        "GET /api/ventures error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to load ventures"
        });

    }

  }
);


/* =========================================================
   CURRENT USER'S VENTURES
   GET /api/ventures/mine
========================================================= */

router.get(
  "/mine",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const ventures =
        await populateVenture(
          Venture.find({
            ownerId:
              req.user._id ||
              req.user.id
          })
        )
          .sort({
            updatedAt:-1
          });


      res.json(
        ventures
      );

    }catch(error){

      console.error(
        "GET /api/ventures/mine error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to load your ventures"
        });

    }

  }
);


/* =========================================================
   USER'S SAVED VENTURES
   GET /api/ventures/saved
========================================================= */

router.get(
  "/saved",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const interests =
        await VentureInterest
          .find({
            userId:
              req.user._id ||
              req.user.id,

            type:"save",

            status:"active"
          })
          .sort({
            createdAt:-1
          })
          .populate({
            path:"ventureId",

            populate:[
              {
                path:"ownerId",

                select:
                  "name role profileImage headline aiftVerified"
              },
              {
                path:"schoolId",

                select:
                  "name schoolName profileImage aiftVerified"
              }
            ]
          });


      const ventures =
        interests
          .map(
            item =>
              item.ventureId
          )
          .filter(Boolean);


      res.json(
        ventures
      );

    }catch(error){

      console.error(
        "GET /api/ventures/saved error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to load saved ventures"
        });

    }

  }
);


/* =========================================================
   OWNER INTEREST INBOX
   GET /api/ventures/:id/interests
========================================================= */

router.get(
  "/:id/interests",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid venture ID"
          });

      }


      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to view this venture's interest requests"
          });

      }


      const interests =
        await VentureInterest
          .find({
            ventureId:
              venture._id,

            type:{
              $nin:[
                "save",
                "follow"
              ]
            }
          })
          .populate(
            "userId",
            [
              "name",
              "email",
              "role",
              "profileImage",
              "headline",
              "companyName",
              "aiftVerified"
            ].join(" ")
          )
          .sort({
            createdAt:-1
          });


      res.json(
        interests
      );

    }catch(error){

      console.error(
        "GET /api/ventures/:id/interests error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to load venture interest"
        });

    }

  }
);


/* =========================================================
   CREATE VENTURE
   POST /api/ventures
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const actor =
        await User.findById(
          req.user._id ||
          req.user.id
        );


      if(!actor){

        return res
          .status(401)
          .json({
            message:
              "User not found"
          });

      }


      const role =
        normalizeRole(
          actor
        );


      const allowedRoles =
        new Set([
          "student",
          "talent",
          "teacher",
          "school",
          "employer",
          "agent",
          "family",
          "admin"
        ]);


      if(
        !allowedRoles.has(
          role
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Your account cannot create a venture"
          });

      }


      const title =
        safeString(
          req.body.title,
          140
        );


      if(!title){

        return res
          .status(400)
          .json({
            message:
              "Venture title is required"
          });

      }


      const ventureType =
        VENTURE_TYPES.has(
          String(
            req.body.ventureType
          )
        )
          ? String(
              req.body.ventureType
            )
          : "student-project";


      const stage =
        VENTURE_STAGES.has(
          String(
            req.body.stage
          )
        )
          ? String(
              req.body.stage
            )
          : "idea";


      const visibility =
        VENTURE_VISIBILITIES.has(
          String(
            req.body.visibility
          )
        )
          ? String(
              req.body.visibility
            )
          : "public";


      let schoolId =
        req.body.schoolId;


      if(
        !schoolId
      ){

        schoolId =
          actor.schoolId ||
          actor.linkedSchoolId ||
          (
            role === "school"
              ? actor._id
              : null
          );

      }


      if(
        schoolId &&
        !isValidId(
          schoolId
        )
      ){

        schoolId =
          null;

      }


      const slug =
        await createUniqueSlug(
          title
        );


      const venture =
        await Venture.create({

          ownerId:
            actor._id,

          schoolId:
            schoolId ||
            null,

          title,

          slug,

          tagline:
            safeString(
              req.body.tagline,
              220
            ),

          description:
            safeString(
              req.body.description,
              8000
            ),

          ventureType,

          stage,

          industry:
            safeString(
              req.body.industry,
              100
            ),

          tags:
            normalizeStringArray(
              req.body.tags
            ),

          location:
            safeString(
              req.body.location,
              160
            ),

          solutionStatus:
            [
              "",
              "concept",
              "prototype",
              "mvp",
              "beta",
              "live",
              "operating"
            ].includes(
              String(
                req.body.solutionStatus ||
                ""
              )
            )
              ? String(
                  req.body.solutionStatus ||
                  ""
                )
              : "",

          marketSize:
            safeString(
              req.body.marketSize,
              300
            ),

          customerType:
            [
              "",
              "consumer",
              "business",
              "schools",
              "government",
              "nonprofits",
              "mixed"
            ].includes(
              String(
                req.body.customerType ||
                ""
              )
            )
              ? String(
                  req.body.customerType ||
                  ""
                )
              : "",

          marketReach:
            [
              "",
              "local",
              "regional",
              "national",
              "southeast_asia",
              "global"
            ].includes(
              String(
                req.body.marketReach ||
                ""
              )
            )
              ? String(
                  req.body.marketReach ||
                  ""
                )
              : "",

          revenueModel:
            [
              "",
              "subscription",
              "product_sales",
              "service_fee",
              "transaction_fee",
              "marketplace",
              "advertising",
              "licensing",
              "sponsorship",
              "grant_funded",
              "nonprofit",
              "other"
            ].includes(
              String(
                req.body.revenueModel ||
                ""
              )
            )
              ? String(
                  req.body.revenueModel ||
                  ""
                )
              : "",

          revenueStatus:
            [
              "",
              "pre_revenue",
              "first_sales",
              "recurring_revenue",
              "profitable"
            ].includes(
              String(
                req.body.revenueStatus ||
                ""
              )
            )
              ? String(
                  req.body.revenueStatus ||
                  ""
                )
              : "",

          problem:
            safeString(
              req.body.problem,
              5000
            ),

          solution:
            safeString(
              req.body.solution,
              5000
            ),

          targetMarket:
            safeString(
              req.body.targetMarket,
              3000
            ),

          businessModel:
            safeString(
              req.body.businessModel,
              3000
            ),

          competitiveAdvantage:
            safeString(
              req.body
                .competitiveAdvantage,
              3000
            ),


          /* ===============================================
             TRACTION
          =============================================== */

          traction:{

            users:
              Math.max(
                0,
                Number(
                  req.body
                    ?.traction
                    ?.users
                ) ||
                0
              ),

            customers:
              Math.max(
                0,
                Number(
                  req.body
                    ?.traction
                    ?.customers
                ) ||
                0
              ),

            revenue:
              Math.max(
                0,
                Number(
                  req.body
                    ?.traction
                    ?.revenue
                ) ||
                0
              ),

            pilots:
              Math.max(
                0,
                Number(
                  req.body
                    ?.traction
                    ?.pilots
                ) ||
                0
              ),

            partnerships:
              Math.max(
                0,
                Number(
                  req.body
                    ?.traction
                    ?.partnerships
                ) ||
                0
              ),

            growth:
              safeString(
                req.body
                  ?.traction
                  ?.growth,
                300
              ),

            description:
              safeString(
                req.body
                  ?.traction
                  ?.description,
                2000
              )

          },


          /* ===============================================
             FOUNDER + TEAM
          =============================================== */

          founderRole:
            safeString(
              req.body.founderRole,
              120
            ),

          founderBio:
            safeString(
              req.body.founderBio,
              1200
            ),

          teamSize:
            Math.max(
              1,
              Number(
                req.body.teamSize
              ) ||
              1
            ),

          teamMembers:
            Array.isArray(
              req.body.teamMembers
            )
              ? req.body.teamMembers
                  .slice(
                    0,
                    30
                  )
                  .map(
                    member => ({
                      userId:
                        isValidId(
                          member?.userId
                        )
                          ? member.userId
                          : null,

                      name:
                        safeString(
                          member?.name,
                          120
                        ),

                      role:
                        safeString(
                          member?.role,
                          120
                        ),

                      bio:
                        safeString(
                          member?.bio,
                          500
                        )
                    })
                  )
              : [],


          /* ===============================================
             FUNDING
          =============================================== */

          fundingGoal:
            Math.max(
              0,
              Number(
                req.body.fundingGoal
              ) ||
              0
            ),

          currency:
            safeString(
              req.body.currency ||
              "PHP",
              10
            )
              .toUpperCase(),

          fundingRaised:0,

          fundingPurpose:
            safeString(
              req.body.fundingPurpose,
              3000
            ),

          fundingTypes:
            normalizeFundingTypes(
              req.body.fundingTypes
            ),

          seekingInvestment:
            Boolean(
              req.body
                .seekingInvestment
            ),

          investmentRangeMin:
            Math.max(
              0,
              Number(
                req.body
                  .investmentRangeMin
              ) ||
              0
            ),

          investmentRangeMax:
            Math.max(
              0,
              Number(
                req.body
                  .investmentRangeMax
              ) ||
              0
            ),

          investmentNotes:
            safeString(
              req.body
                .investmentNotes,
              2500
            ),

          fundingStage:
            [
              "",
              "pre_seed",
              "seed",
              "growth",
              "project_funding",
              "grant",
              "not_applicable"
            ].includes(
              String(
                req.body.fundingStage ||
                ""
              )
            )
              ? String(
                  req.body.fundingStage ||
                  ""
                )
              : "",

          fundingDeadline:
            req.body.fundingDeadline
              ? new Date(
                  req.body.fundingDeadline
                )
              : null,

          supportMessage:
            safeString(
              req.body.supportMessage,
              2000
            ),

          logoUrl:
            safeString(
              req.body.logoUrl,
              1000
            ),

          coverUrl:
            safeString(
              req.body.coverUrl,
              1000
            ),

          pitchVideoUrl:
            safeString(
              req.body
                .pitchVideoUrl,
              1000
            ),

          websiteUrl:
            safeString(
              req.body.websiteUrl,
              1000
            ),

          demoUrl:
            safeString(
              req.body.demoUrl,
              1000
            ),


          /* ===============================================
             PITCH DOCUMENTS
          =============================================== */

          documents:
            Array.isArray(
              req.body.documents
            )
              ? req.body.documents
                  .slice(
                    0,
                    20
                  )
                  .map(
                    document => {

                      const allowedTypes =
                        new Set([
                          "pitch-deck",
                          "business-plan",
                          "financials",
                          "research",
                          "prototype",
                          "other"
                        ]);


                      const allowedVisibility =
                        new Set([
                          "public",
                          "interested-only",
                          "private"
                        ]);


                      const type =
                        safeString(
                          document?.type,
                          40
                        );


                      const documentVisibility =
                        safeString(
                          document?.visibility,
                          40
                        );


                      return {

                        name:
                          safeString(
                            document?.name ||
                            document?.originalName,
                            180
                          ),

                        type:
                          allowedTypes.has(
                            type
                          )
                            ? type
                            : "other",

                        url:
                          safeString(
                            document?.url ||
                            document?.secureUrl,
                            1000
                          ),

                        visibility:
                          allowedVisibility.has(
                            documentVisibility
                          )
                            ? documentVisibility
                            : "private"

                      };

                    }
                  )
                  .filter(
                    document =>
                      document.url
                  )
              : [],

          visibility,

          /*
            New ventures begin as drafts.
            Owner explicitly publishes later.
          */

          status:"draft"

        });


      const populated =
        await populateVenture(
          Venture.findById(
            venture._id
          )
        );


      res
        .status(201)
        .json(
          populated
        );

    }catch(error){

      console.error(
        "POST /api/ventures error:",
        error
      );


      res
        .status(400)
        .json({
          message:
            "Failed to create venture"
        });

    }

  }
);

/* =========================================================
   OWNER VENTURE DETAIL
   GET /api/ventures/:id/manage
========================================================= */

router.get(
  "/:id/manage",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid venture ID"
          });

      }


      const venture =
        await populateVenture(
          Venture.findById(
            req.params.id
          )
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to manage this venture"
          });

      }


      return res.json(
        venture
      );


    }catch(error){

      console.error(
        "GET /api/ventures/:id/manage error:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load venture for editing"
        });

    }

  }
);

/* =========================================================
   VENTURE DETAIL
   GET /api/ventures/:id
========================================================= */

router.get(
  "/:id",
  async (
    req,
    res
  ) => {

    try{

      const value =
        safeString(
          req.params.id,
          120
        );


      let query;


      if(
        isValidId(
          value
        )
      ){

        query = {
          _id:value
        };

      }else{

        query = {
          slug:value
            .toLowerCase()
        };

      }


      const venture =
        await populateVenture(
          Venture.findOne({
            ...query,

            status:"active",

            visibility:"public"
          })
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      res.json(
        venture
      );

    }catch(error){

      console.error(
        "GET /api/ventures/:id error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to load venture"
        });

    }

  }
);


/* =========================================================
   UPDATE OWN VENTURE
   PATCH /api/ventures/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid venture ID"
          });

      }


      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this venture"
          });

      }


      const textFields = {

        title:140,

        tagline:220,

        description:8000,

        industry:100,

        location:160,

        marketSize:300,

        problem:5000,

        solution:5000,

        targetMarket:3000,

        businessModel:3000,

        competitiveAdvantage:3000,

        fundingPurpose:3000,

        investmentNotes:2500,

        founderRole:120,

        founderBio:1200,

        supportMessage:2000,

        logoUrl:1000,

        coverUrl:1000,

        pitchVideoUrl:1000,

        websiteUrl:1000,

        demoUrl:1000

      };


      for(
        const [
          field,
          maxLength
        ] of
        Object.entries(
          textFields
        )
      ){

        if(
          req.body[field] !==
          undefined
        ){

          venture[field] =
            safeString(
              req.body[field],
              maxLength
            );

        }

      }


      if(
        req.body.title !==
        undefined
      ){

        if(
          !venture.title
        ){

          return res
            .status(400)
            .json({
              message:
                "Venture title is required"
            });

        }


        venture.slug =
          await createUniqueSlug(
            venture.title,
            venture._id
          );

      }


      if(
        req.body.ventureType !==
        undefined &&
        VENTURE_TYPES.has(
          String(
            req.body.ventureType
          )
        )
      ){

        venture.ventureType =
          String(
            req.body.ventureType
          );

      }


      if(
        req.body.stage !==
        undefined &&
        VENTURE_STAGES.has(
          String(
            req.body.stage
          )
        )
      ){

        venture.stage =
          String(
            req.body.stage
          );

      }


      if(
        req.body.visibility !==
        undefined &&
        VENTURE_VISIBILITIES.has(
          String(
            req.body.visibility
          )
        )
      ){

        venture.visibility =
          String(
            req.body.visibility
          );

      }


      if(
        req.body.tags !==
        undefined
      ){

        venture.tags =
          normalizeStringArray(
            req.body.tags
          );

      }


      if(
        req.body.fundingTypes !==
        undefined
      ){

        venture.fundingTypes =
          normalizeFundingTypes(
            req.body.fundingTypes
          );

      }


      const numberFields = [
        "fundingGoal",
        "investmentRangeMin",
        "investmentRangeMax"
      ];


      numberFields.forEach(
        field => {

          if(
            req.body[field] !==
            undefined
          ){

            venture[field] =
              Math.max(
                0,
                Number(
                  req.body[field]
                ) ||
                0
              );

          }

        }
      );


      if(
        req.body.currency !==
        undefined
      ){

        venture.currency =
          safeString(
            req.body.currency,
            10
          )
            .toUpperCase() ||
          "PHP";

      }


      if(
        req.body
          .seekingInvestment !==
        undefined
      ){

        venture.seekingInvestment =
          Boolean(
            req.body
              .seekingInvestment
          );

      }


      /* =====================================================
         BUILDER ENUM FIELDS
      ====================================================== */

      const enumUpdates = {

        solutionStatus:
          new Set([
            "",
            "concept",
            "prototype",
            "mvp",
            "beta",
            "live",
            "operating"
          ]),

        customerType:
          new Set([
            "",
            "consumer",
            "business",
            "schools",
            "government",
            "nonprofits",
            "mixed"
          ]),

        marketReach:
          new Set([
            "",
            "local",
            "regional",
            "national",
            "southeast_asia",
            "global"
          ]),

        revenueModel:
          new Set([
            "",
            "subscription",
            "product_sales",
            "service_fee",
            "transaction_fee",
            "marketplace",
            "advertising",
            "licensing",
            "sponsorship",
            "grant_funded",
            "nonprofit",
            "other"
          ]),

        revenueStatus:
          new Set([
            "",
            "pre_revenue",
            "first_sales",
            "recurring_revenue",
            "profitable"
          ]),

        fundingStage:
          new Set([
            "",
            "pre_seed",
            "seed",
            "growth",
            "project_funding",
            "grant",
            "not_applicable"
          ])

      };


      for(
        const [
          field,
          allowedValues
        ]
        of Object.entries(
          enumUpdates
        )
      ){

        if(
          req.body[field] ===
          undefined
        ){
          continue;
        }


        const value =
          String(
            req.body[field] ||
            ""
          );


        if(
          allowedValues.has(
            value
          )
        ){

          venture[field] =
            value;

        }

      }


      /* =====================================================
         TEAM
      ====================================================== */

      if(
        req.body.teamSize !==
        undefined
      ){

        venture.teamSize =
          Math.max(
            1,
            Number(
              req.body.teamSize
            ) ||
            1
          );

      }


      if(
        req.body.teamMembers !==
        undefined
      ){

        venture.teamMembers =
          Array.isArray(
            req.body.teamMembers
          )
            ? req.body.teamMembers
                .slice(
                  0,
                  30
                )
                .map(
                  member => ({
                    userId:
                      isValidId(
                        member?.userId
                      )
                        ? member.userId
                        : null,

                    name:
                      safeString(
                        member?.name,
                        120
                      ),

                    role:
                      safeString(
                        member?.role,
                        120
                      ),

                    bio:
                      safeString(
                        member?.bio,
                        500
                      )
                  })
                )
            : [];

      }


      /* =====================================================
         TRACTION
      ====================================================== */

      if(
        req.body.traction &&
        typeof req.body.traction ===
          "object"
      ){

        const traction =
          req.body.traction;


        [
          "users",
          "customers",
          "revenue",
          "pilots",
          "partnerships"
        ].forEach(
          field => {

            if(
              traction[field] !==
              undefined
            ){

              venture.traction[field] =
                Math.max(
                  0,
                  Number(
                    traction[field]
                  ) ||
                  0
                );

            }

          }
        );


        if(
          traction.growth !==
          undefined
        ){

          venture.traction.growth =
            safeString(
              traction.growth,
              300
            );

        }


        if(
          traction.description !==
          undefined
        ){

          venture.traction.description =
            safeString(
              traction.description,
              2000
            );

        }

      }


      /* =====================================================
         FUNDING DEADLINE
      ====================================================== */

      if(
        req.body.fundingDeadline !==
        undefined
      ){

        if(
          !req.body.fundingDeadline
        ){

          venture.fundingDeadline =
            null;

        }else{

          const fundingDate =
            new Date(
              req.body.fundingDeadline
            );


          venture.fundingDeadline =
            Number.isNaN(
              fundingDate.getTime()
            )
              ? null
              : fundingDate;

        }

      }


      /* =====================================================
         DOCUMENTS
      ====================================================== */

      if(
        req.body.documents !==
        undefined
      ){

        const allowedDocumentTypes =
          new Set([
            "pitch-deck",
            "business-plan",
            "financials",
            "research",
            "prototype",
            "other"
          ]);


        const allowedDocumentVisibility =
          new Set([
            "public",
            "interested-only",
            "private"
          ]);


        venture.documents =
          Array.isArray(
            req.body.documents
          )
            ? req.body.documents
                .slice(
                  0,
                  20
                )
                .map(
                  document => {

                    const type =
                      safeString(
                        document?.type,
                        40
                      );


                    const visibility =
                      safeString(
                        document?.visibility,
                        40
                      );


                    return {

                      name:
                        safeString(
                          document?.name ||
                          document?.originalName,
                          180
                        ),

                      type:
                        allowedDocumentTypes.has(
                          type
                        )
                          ? type
                          : "other",

                      url:
                        safeString(
                          document?.url ||
                          document?.secureUrl,
                          1000
                        ),

                      visibility:
                        allowedDocumentVisibility.has(
                          visibility
                        )
                          ? visibility
                          : "private"

                    };

                  }
                )
                .filter(
                  document =>
                    document.url
                )
            : [];

      }


      await venture.save();


      const populated =
        await populateVenture(
          Venture.findById(
            venture._id
          )
        );


      res.json(
        populated
      );

    }catch(error){

      console.error(
        "PATCH /api/ventures/:id error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to update venture"
        });

    }

  }
);


/* =========================================================
   PUBLISH
   PATCH /api/ventures/:id/publish
========================================================= */

router.patch(
  "/:id/publish",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to publish this venture"
          });

      }


      if(
        !venture.title ||
        !venture.description ||
        !venture.problem ||
        !venture.solution
      ){

        return res
          .status(400)
          .json({
            message:
              "Complete the title, description, problem and solution before publishing"
          });

      }


      venture.status =
        "active";


      await venture.save();


      res.json({
        message:
          "Venture published successfully",

        venture
      });

    }catch(error){

      console.error(
        "PATCH /api/ventures/:id/publish error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to publish venture"
        });

    }

  }
);


/* =========================================================
   VIEW TRACKING
   PATCH /api/ventures/:id/view
========================================================= */

router.patch(
  "/:id/view",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      const viewerId =
        String(
          req.user._id ||
          req.user.id
        );


      const alreadyViewed =
        venture.uniqueViewers
          .some(
            id =>
              String(id) ===
              viewerId
          );


      if(
        !alreadyViewed
      ){

        venture.uniqueViewers
          .push(
            viewerId
          );


        venture.viewsCount =
          Number(
            venture.viewsCount ||
            0
          ) +
          1;

      }


      venture.lastViewedAt =
        new Date();


      await venture.save({
        validateModifiedOnly:true
      });


      res.json({
        viewsCount:
          venture.viewsCount,

        uniqueViewers:
          venture
            .uniqueViewers
            .length
      });

    }catch(error){

      console.error(
        "PATCH /api/ventures/:id/view error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to track venture view"
        });

    }

  }
);


/* =========================================================
   TOGGLE SAVE
   PATCH /api/ventures/:id/save
========================================================= */

router.patch(
  "/:id/save",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      const userId =
        req.user._id ||
        req.user.id;


      const existing =
        await VentureInterest
          .findOne({
            ventureId:
              venture._id,

            userId,

            type:"save"
          });


      let saved;


      if(existing){

        await VentureInterest
          .deleteOne({
            _id:
              existing._id
          });


        venture.savesCount =
          Math.max(
            0,
            Number(
              venture.savesCount ||
              0
            ) -
            1
          );


        saved =
          false;

      }else{

        await VentureInterest
          .create({
            ventureId:
              venture._id,

            userId,

            type:"save",

            status:"active"
          });


        venture.savesCount =
          Number(
            venture.savesCount ||
            0
          ) +
          1;


        saved =
          true;

      }


      await venture.save({
        validateModifiedOnly:true
      });


      res.json({
        saved,

        ventureId:
          venture._id,

        savesCount:
          venture.savesCount
      });

    }catch(error){

      console.error(
        "PATCH /api/ventures/:id/save error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to save venture"
        });

    }

  }
);


/* =========================================================
   EXPRESS INTEREST
   POST /api/ventures/:id/interests
========================================================= */

router.post(
  "/:id/interests",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      const userId =
        req.user._id ||
        req.user.id;


      if(
        sameId(
          venture.ownerId,
          userId
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "You cannot express interest in your own venture"
          });

      }


      const type =
        safeString(
          req.body.type,
          40
        );


      if(
        !INTEREST_TYPES.has(
          type
        ) ||
        [
          "save",
          "follow"
        ].includes(
          type
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid venture interest type"
          });

      }


      if(
        type ===
          "investment"
      ){

        /*
          Investment actions are reserved for
          AIFT Family accounts with Investor Mode
          enabled.

          This does NOT create a separate
          "investor" User role.
        */

        const investorUser =
          await User
            .findById(
              userId
            )
            .select(
              "role familyProfile"
            );


        if(!investorUser){

          return res
            .status(401)
            .json({
              message:
                "User account not found"
            });

        }


        const investorRole =
          normalizeRole(
            investorUser
          );


        const investorAllowed =
          (
            investorRole ===
              "admin" ||
            (
              investorRole ===
                "family" &&
              investorUser
                .familyProfile
                ?.investorEnabled ===
                true
            )
          );


        if(!investorAllowed){

          return res
            .status(403)
            .json({
              message:
                "Enable Investor Mode before expressing investment interest"
            });

        }


        if(
          !venture
            .seekingInvestment
        ){

          return res
            .status(400)
            .json({
              message:
                "This venture is not currently seeking investment interest"
            });

        }

      }


      const interest =
        await VentureInterest
          .findOneAndUpdate(
            {
              ventureId:
                venture._id,

              userId,

              type
            },
            {
              $set:{
                status:"pending",

                message:
                  safeString(
                    req.body.message,
                    3000
                  ),

                amountMin:
                  Math.max(
                    0,
                    Number(
                      req.body
                        .amountMin
                    ) ||
                    0
                  ),

                amountMax:
                  Math.max(
                    0,
                    Number(
                      req.body
                        .amountMax
                    ) ||
                    0
                  ),

                currency:
                  safeString(
                    req.body.currency ||
                    venture.currency ||
                    "PHP",
                    10
                  )
                    .toUpperCase()
              }
            },
            {
              new:true,
              upsert:true,
              setDefaultsOnInsert:true
            }
          );


      const counterField = {

        investment:
          "interestCount",

        sponsorship:
          "sponsorInterestCount",

        mentorship:
          "mentorInterestCount",

        pilot:
          "pilotInterestCount",

        grant:
          "interestCount"

      }[type];


      /*
        Recalculate rather than blindly increment.
        This avoids inflated counters when a user updates
        an existing request.
      */

      if(counterField){

        const count =
          await VentureInterest
            .countDocuments({
              ventureId:
                venture._id,

              type,

              status:{
                $in:[
                  "pending",
                  "accepted",
                  "active"
                ]
              }
            });


        venture[counterField] =
          count;


        await venture.save({
          validateModifiedOnly:true
        });

      }


      const populated =
        await VentureInterest
          .findById(
            interest._id
          )
          .populate(
            "userId",
            "name role profileImage headline companyName aiftVerified"
          );


      res
        .status(201)
        .json({
          message:
            "Interest sent successfully",

          interest:
            populated
        });

    }catch(error){

      console.error(
        "POST /api/ventures/:id/interests error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to send venture interest"
        });

    }

  }
);


/* =========================================================
   RESPOND TO INTEREST
   PATCH /api/ventures/:ventureId/interests/:interestId
========================================================= */

router.patch(
  "/:ventureId/interests/:interestId",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.ventureId
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to respond to this request"
          });

      }


      const interest =
        await VentureInterest
          .findOne({
            _id:
              req.params
                .interestId,

            ventureId:
              venture._id
          });


      if(!interest){

        return res
          .status(404)
          .json({
            message:
              "Interest request not found"
          });

      }


      const status =
        safeString(
          req.body.status,
          30
        );


      if(
        ![
          "accepted",
          "declined",
          "closed"
        ].includes(
          status
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid response status"
          });

      }


      interest.status =
        status;


      interest.founderResponse =
        safeString(
          req.body
            .founderResponse,
          3000
        );


      interest.respondedAt =
        new Date();


      await interest.save();


      res.json({
        message:
          "Interest request updated",

        interest
      });

    }catch(error){

      console.error(
        "PATCH venture interest error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to update interest request"
        });

    }

  }
);


/* =========================================================
   SCHOOL VERIFICATION
   PATCH /api/ventures/:id/verify-school
========================================================= */

router.patch(
  "/:id/verify-school",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canVerifyVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Only the linked school can verify this venture"
          });

      }


      const verified =
        req.body.verified !==
          false;


      venture.schoolVerified =
        verified;


      venture.verifiedBySchoolId =
        verified
          ? (
              req.user._id ||
              req.user.id
            )
          : null;


      venture.verifiedAt =
        verified
          ? new Date()
          : null;


      await venture.save({
        validateModifiedOnly:true
      });


      res.json({
        message:
          verified
            ? "Venture verified by school"
            : "School verification removed",

        venture
      });

    }catch(error){

      console.error(
        "PATCH venture school verification error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to update school verification"
        });

    }

  }
);


/* =========================================================
   OWNER STATUS
   PATCH /api/ventures/:id/status
========================================================= */

router.patch(
  "/:id/status",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to change this venture"
          });

      }


      const status =
        safeString(
          req.body.status,
          30
        );


      const ownerAllowed =
        new Set([
          "draft",
          "submitted",
          "active",
          "paused",
          "funded",
          "closed"
        ]);


      if(
        !ownerAllowed.has(
          status
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid venture status"
          });

      }


      venture.status =
        status;


      await venture.save();


      res.json(
        venture
      );

    }catch(error){

      console.error(
        "PATCH venture status error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to update venture status"
        });

    }

  }
);


/* =========================================================
   DELETE OWN VENTURE
   DELETE /api/ventures/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const venture =
        await Venture.findById(
          req.params.id
        );


      if(!venture){

        return res
          .status(404)
          .json({
            message:
              "Venture not found"
          });

      }


      if(
        !canManageVenture(
          req.user,
          venture
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to delete this venture"
          });

      }


      await VentureInterest
        .deleteMany({
          ventureId:
            venture._id
        });


      await venture.deleteOne();


      res.json({
        message:
          "Venture deleted successfully"
      });

    }catch(error){

      console.error(
        "DELETE /api/ventures/:id error:",
        error
      );


      res
        .status(500)
        .json({
          message:
            "Failed to delete venture"
        });

    }

  }
);


module.exports =
  router;
