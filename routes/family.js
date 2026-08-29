const express =
  require("express");

const auth =
  require("../middleware/auth");

const User =
  require("../models/User");


const router =
  express.Router();


/* ============================================
   CONSTANTS
============================================ */

const FAMILY_RELATIONSHIP_TYPES =
  new Set([
    "",
    "parent",
    "guardian",
    "family_member",
    "other"
  ]);


/* ============================================
   HELPERS
============================================ */

function cleanString(
  value,
  maxLength = 500
) {

  if(
    value === undefined ||
    value === null
  ){
    return "";
  }


  return String(value)
    .trim()
    .slice(
      0,
      maxLength
    );

}


function cleanStringArray(
  value,
  maxItems = 30,
  maxLength = 100
) {

  if(
    !Array.isArray(value)
  ){
    return [];
  }


  return [
    ...new Set(
      value
        .map(item =>
          cleanString(
            item,
            maxLength
          )
        )
        .filter(Boolean)
    )
  ].slice(
    0,
    maxItems
  );

}


function isFamilyUser(user) {

  return (
    user &&
    (
      user.role === "family" ||
      user.role === "admin"
    )
  );

}


function familyAccessGuard(
  req,
  res,
  next
) {

  if(
    !isFamilyUser(
      req.user
    )
  ){

    return res
      .status(403)
      .json({

        success:
          false,

        message:
          "Family account access required"

      });

  }


  next();

}


function serializeFamilyProfile(user) {

  const familyProfile =
    user.familyProfile || {};


  return {

    user: {

      id:
        String(
          user._id
        ),

      name:
        user.name || "",

      email:
        user.email || "",

      role:
        user.role,

      profileImage:
        user.profileImage || null,

      location:
        user.location || ""

    },


    familyProfile: {

      investorEnabled:
        familyProfile
          .investorEnabled === true,

      relationshipType:
        familyProfile
          .relationshipType || "",

      preferredLocation:
        familyProfile
          .preferredLocation || "",

      educationPriorities:
        Array.isArray(
          familyProfile
            .educationPriorities
        )
          ? familyProfile
              .educationPriorities
          : [],

      investmentInterests:
        Array.isArray(
          familyProfile
            .investmentInterests
        )
          ? familyProfile
              .investmentInterests
          : [],

      investorProfileCompleted:
        familyProfile
          .investorProfileCompleted === true,

      onboardingCompleted:
        familyProfile
          .onboardingCompleted === true

    }

  };

}


/* ============================================
   AUTH + FAMILY ACCESS
============================================ */

router.use(
  auth,
  familyAccessGuard
);


/* ============================================
   GET FAMILY PROFILE

   GET /api/family/profile
============================================ */

router.get(
  "/profile",
  async (req,res) => {

    try {

      const user =
        await User
          .findById(
            req.user._id
          )
          .select(
            [
              "_id",
              "name",
              "email",
              "role",
              "profileImage",
              "location",
              "familyProfile"
            ].join(" ")
          );


      if(!user){

        return res
          .status(404)
          .json({

            success:
              false,

            message:
              "Family account not found"

          });

      }


      return res.json({

        success:
          true,

        ...serializeFamilyProfile(
          user
        )

      });


    } catch(error) {

      console.error(
        "GET FAMILY PROFILE ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Could not load family profile"

        });

    }

  }
);


/* ============================================
   UPDATE FAMILY PROFILE

   PATCH /api/family/profile
============================================ */

router.patch(
  "/profile",
  async (req,res) => {

    try {

      const user =
        await User.findById(
          req.user._id
        );


      if(!user){

        return res
          .status(404)
          .json({

            success:
              false,

            message:
              "Family account not found"

          });

      }


      const body =
        req.body &&
        typeof req.body === "object"
          ? req.body
          : {};


      /* --------------------------------------------
         RELATIONSHIP
      -------------------------------------------- */

      if(
        Object.prototype
          .hasOwnProperty.call(
            body,
            "relationshipType"
          )
      ){

        const relationshipType =
          cleanString(
            body.relationshipType,
            50
          )
            .toLowerCase();


        if(
          !FAMILY_RELATIONSHIP_TYPES
            .has(
              relationshipType
            )
        ){

          return res
            .status(400)
            .json({

              success:
                false,

              message:
                "Invalid family relationship type"

            });

        }


        user.familyProfile
          .relationshipType =
            relationshipType;

      }


      /* --------------------------------------------
         PREFERRED LOCATION
      -------------------------------------------- */

      if(
        Object.prototype
          .hasOwnProperty.call(
            body,
            "preferredLocation"
          )
      ){

        user.familyProfile
          .preferredLocation =
            cleanString(
              body.preferredLocation,
              200
            );

      }


      /* --------------------------------------------
         EDUCATION PRIORITIES
      -------------------------------------------- */

      if(
        Object.prototype
          .hasOwnProperty.call(
            body,
            "educationPriorities"
          )
      ){

        if(
          !Array.isArray(
            body.educationPriorities
          )
        ){

          return res
            .status(400)
            .json({

              success:
                false,

              message:
                "Education priorities must be an array"

            });

        }


        user.familyProfile
          .educationPriorities =
            cleanStringArray(
              body.educationPriorities
            );

      }


      /* --------------------------------------------
         INVESTMENT INTERESTS
      -------------------------------------------- */

      if(
        Object.prototype
          .hasOwnProperty.call(
            body,
            "investmentInterests"
          )
      ){

        if(
          !Array.isArray(
            body.investmentInterests
          )
        ){

          return res
            .status(400)
            .json({

              success:
                false,

              message:
                "Investment interests must be an array"

            });

        }


        user.familyProfile
          .investmentInterests =
            cleanStringArray(
              body.investmentInterests
            );

      }


      /* --------------------------------------------
         ONBOARDING
      -------------------------------------------- */

      if(
        Object.prototype
          .hasOwnProperty.call(
            body,
            "onboardingCompleted"
          )
      ){

        user.familyProfile
          .onboardingCompleted =
            body.onboardingCompleted ===
            true;

      }


      await user.save();


      return res.json({

        success:
          true,

        message:
          "Family profile updated",

        ...serializeFamilyProfile(
          user
        )

      });


    } catch(error) {

      console.error(
        "UPDATE FAMILY PROFILE ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Could not update family profile"

        });

    }

  }
);


/* ============================================
   INVESTOR MODE

   PATCH /api/family/investor
============================================ */

router.patch(
  "/investor",
  async (req,res) => {

    try {

      if(
        typeof req.body
          ?.enabled !==
        "boolean"
      ){

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Investor mode requires a boolean enabled value"

          });

      }


      const user =
        await User.findById(
          req.user._id
        );


      if(!user){

        return res
          .status(404)
          .json({

            success:
              false,

            message:
              "Family account not found"

          });

      }


      user.familyProfile
        .investorEnabled =
          req.body.enabled;


      /*
        Investor profile is considered complete once
        Investor Mode is enabled and at least one
        investment interest has been selected.

        This can become more sophisticated later
        without changing the account role.
      */

      user.familyProfile
        .investorProfileCompleted =
          (
            req.body.enabled ===
              true &&
            Array.isArray(
              user.familyProfile
                .investmentInterests
            ) &&
            user.familyProfile
              .investmentInterests
              .length > 0
          );


      await user.save();


      return res.json({

        success:
          true,

        message:
          req.body.enabled
            ? "Investor mode enabled"
            : "Investor mode disabled",

        ...serializeFamilyProfile(
          user
        )

      });


    } catch(error) {

      console.error(
        "UPDATE INVESTOR MODE ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Could not update Investor Mode"

        });

    }

  }
);


module.exports =
  router;
