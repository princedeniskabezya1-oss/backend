const express =
  require("express");

const mongoose =
  require("mongoose");

const auth =
  require("../middleware/auth");

const StudentPortfolio =
  require("../models/StudentPortfolio");


const router =
  express.Router();


function normalizeString(
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


function normalizeStringArray(
  values,
  maxItems,
  maxLength
){

  if (
    !Array.isArray(
      values
    )
  ){
    return [];
  }


  const unique =
    new Set();


  const output =
    [];


  for (
    const value
    of values
  ){

    const normalized =
      normalizeString(
        value,
        maxLength
      );


    if (!normalized){
      continue;
    }


    const key =
      normalized.toLowerCase();


    if (
      unique.has(
        key
      )
    ){
      continue;
    }


    unique.add(
      key
    );


    output.push(
      normalized
    );


    if (
      output.length >=
      maxItems
    ){
      break;
    }

  }


  return output;

}


function isValidId(
  value
){

  return mongoose.Types.ObjectId
    .isValid(
      String(
        value ||
        ""
      )
    );

}


function getStudentSchoolId(
  user
){

  return (
    user?.schoolId ||
    user?.linkedSchoolId ||
    null
  );

}


function canViewSchoolPortfolio(
  viewer,
  portfolio
){

  if (!viewer){
    return false;
  }


  if (
    viewer.role ===
    "admin"
  ){
    return true;
  }


  const portfolioSchoolId =
    String(
      portfolio.schoolId ||
      ""
    );


  if (
    !portfolioSchoolId
  ){
    return false;
  }


  if (
    viewer.role ===
    "school"
  ){

    return (
      String(
        viewer._id
      ) ===
      portfolioSchoolId
    );

  }


  const viewerSchoolId =
    String(
      getStudentSchoolId(
        viewer
      ) ||
      ""
    );


  return (
    viewerSchoolId &&
    viewerSchoolId ===
      portfolioSchoolId
  );

}


/* =========================================================
   GET MY PORTFOLIO
========================================================= */

router.get(
  "/me",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        req.user.role !==
        "student"
      ){

        return res
          .status(403)
          .json({
            message:
              "Only students can access a student portfolio."
          });

      }


      let portfolio =
        await StudentPortfolio
          .findOne({
            studentId:
              req.user._id
          });


      if (!portfolio){

        portfolio =
          await StudentPortfolio.create({
            studentId:
              req.user._id,

            schoolId:
              getStudentSchoolId(
                req.user
              )
          });

      }


      return res.json({
        portfolio
      });

    }catch(error){

      console.error(
        "Get student portfolio failed:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Could not load student portfolio."
        });

    }

  }
);


/* =========================================================
   UPDATE MY PORTFOLIO
========================================================= */

router.patch(
  "/me",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        req.user.role !==
        "student"
      ){

        return res
          .status(403)
          .json({
            message:
              "Only students can update a student portfolio."
          });

      }


      const body =
        req.body ||
        {};


      const allowedVisibility =
        [
          "private",
          "school",
          "public"
        ];


      const visibility =
        allowedVisibility.includes(
          body.visibility
        )
          ? body.visibility
          : "private";


      const update = {
        schoolId:
          getStudentSchoolId(
            req.user
          ),

        visibility,

        headline:
          normalizeString(
            body.headline,
            160
          ),

        about:
          normalizeString(
            body.about,
            2000
          ),

        careerInterest:
          normalizeString(
            body.careerInterest,
            160
          ),

        opportunityType:
          normalizeString(
            body.opportunityType,
            50
          ),

        skills:
          normalizeStringArray(
            body.skills,
            20,
            80
          ),

        languages:
          normalizeStringArray(
            body.languages,
            10,
            80
          )
      };


      if (
        visibility ===
        "public"
      ){

        update.lastPublishedAt =
          new Date();

      }


      const portfolio =
        await StudentPortfolio
          .findOneAndUpdate(
            {
              studentId:
                req.user._id
            },
            {
              $set:update,

              $setOnInsert:{
                studentId:
                  req.user._id
              }
            },
            {
              new:true,
              upsert:true,
              runValidators:true
            }
          );


      return res.json({
        portfolio
      });

    }catch(error){

      console.error(
        "Update student portfolio failed:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Could not update student portfolio."
        });

    }

  }
);


/* =========================================================
   PUBLIC PORTFOLIO
========================================================= */

router.get(
  "/:studentId/public",
  async (
    req,
    res
  ) => {

    try{

      const studentId =
        req.params.studentId;


      if (
        !isValidId(
          studentId
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid student ID."
          });

      }


      const portfolio =
        await StudentPortfolio
          .findOne({
            studentId,
            visibility:"public"
          })
          .populate(
            "studentId",
            "name profileImage course program schoolId linkedSchoolId"
          )
          .populate(
            "schoolId",
            "name profileImage"
          );


      if (!portfolio){

        return res
          .status(404)
          .json({
            message:
              "Public portfolio not available."
          });

      }


      portfolio.viewsCount =
        Number(
          portfolio.viewsCount ||
          0
        ) + 1;


      await portfolio.save();


      return res.json({
        portfolio
      });

    }catch(error){

      console.error(
        "Get public student portfolio failed:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Could not load public portfolio."
        });

    }

  }
);


/* =========================================================
   SCHOOL / AUTHORIZED VIEW
========================================================= */

router.get(
  "/:studentId",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const studentId =
        req.params.studentId;


      if (
        !isValidId(
          studentId
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid student ID."
          });

      }


      const portfolio =
        await StudentPortfolio
          .findOne({
            studentId
          })
          .populate(
            "studentId",
            "name profileImage course program schoolId linkedSchoolId"
          )
          .populate(
            "schoolId",
            "name profileImage"
          );


      if (!portfolio){

        return res
          .status(404)
          .json({
            message:
              "Portfolio not found."
          });

      }


      const isOwner =
        String(
          portfolio.studentId?._id ||
          portfolio.studentId
        ) ===
        String(
          req.user._id
        );


      if (isOwner){

        return res.json({
          portfolio
        });

      }


      if (
        portfolio.visibility ===
        "public"
      ){

        return res.json({
          portfolio
        });

      }


      if (
        portfolio.visibility ===
          "school" &&
        canViewSchoolPortfolio(
          req.user,
          portfolio
        )
      ){

        return res.json({
          portfolio
        });

      }


      return res
        .status(403)
        .json({
          message:
            "You are not allowed to view this portfolio."
        });

    }catch(error){

      console.error(
        "Get student portfolio failed:",
        error
      );


      return res
        .status(500)
        .json({
          message:
            "Could not load student portfolio."
        });

    }

  }
);


module.exports =
  router;
