const express =
  require("express");

const mongoose =
  require("mongoose");

const auth =
  require("../middleware/auth");

const FamilyChild =
  require("../models/FamilyChild");

const User =
  require("../models/User");


const router =
  express.Router();


/* ============================================
   HELPERS
============================================ */

function isFamilyUser(user) {

  return Boolean(
    user &&
    (user._id || user.id)
  );

}


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


function cleanInterests(value) {

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
            100
          )
        )
        .filter(Boolean)
    )
  ]
    .slice(
      0,
      30
    );

}


function parseOptionalDate(value) {

  if(!value){
    return null;
  }


  const date =
    new Date(value);


  if(
    Number.isNaN(
      date.getTime()
    )
  ){
    return null;
  }


  return date;

}


function normalizeChildPayload(body = {}) {

  return {

    firstName:
      cleanString(
        body.firstName,
        100
      ),

    lastName:
      cleanString(
        body.lastName,
        100
      ),

    birthDate:
      parseOptionalDate(
        body.birthDate
      ),

    profileImage:
      cleanString(
        body.profileImage,
        2000
      ) || null,

    location:
      cleanString(
        body.location,
        200
      ),

    educationLevel:
      cleanString(
        body.educationLevel,
        50
      ),

    grade:
      cleanString(
        body.grade,
        100
      ),

    currentSchool:
      cleanString(
        body.currentSchool,
        200
      ),

    track:
      cleanString(
        body.track,
        200
      ),

    goal:
      cleanString(
        body.goal,
        300
      ),

    interests:
      cleanInterests(
        body.interests
      ),

    notes:
      cleanString(
        body.notes,
        2000
      ),

    consentConfirmed:
      body.consentConfirmed === true

  };

}


async function findOwnedChild(
  req,
  childId
) {

  if(
    !mongoose.Types.ObjectId
      .isValid(childId)
  ){
    return null;
  }


  const query = {
    _id: childId
  };


  if(
    req.user.role !== "admin"
  ){

    query.familyId =
      req.user._id;

  }


  return FamilyChild.findOne(
    query
  );

}


/* ============================================
   FAMILY ROLE GUARD
============================================ */

router.use(
  auth,
  (req,res,next) => {

    if(
      !isFamilyUser(
        req.user
      )
    ){

      return res
        .status(403)
        .json({

          message:
            "Sign in to access Family Advantage"

        });

    }


    next();

  }
);


/* ============================================
   GET MY CHILDREN
============================================ */

router.get(
  "/",
  async (req,res) => {

    try {

      const query = {
        status: {
          $ne: "archived"
        }
      };


      if(
        req.user.role !== "admin"
      ){

        query.familyId =
          req.user._id;

      }


      const children =
        await FamilyChild
          .find(query)
          .populate(
            "linkedStudentId",
            "name email profileImage schoolId course yearLevel role"
          )
          .sort({
            createdAt: 1
          })
          .lean();


      return res.json({
        children
      });


    } catch(error) {

      console.error(
        "GET FAMILY CHILDREN ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not load family children"

        });

    }

  }
);


/* ============================================
   GET ONE CHILD
============================================ */

router.get(
  "/:id",
  async (req,res) => {

    try {

      const child =
        await findOwnedChild(
          req,
          req.params.id
        );


      if(!child){

        return res
          .status(404)
          .json({

            message:
              "Child profile not found"

          });

      }


      await child.populate(
        "linkedStudentId",
        "name email profileImage schoolId course yearLevel role"
      );


      return res.json({
        child
      });


    } catch(error) {

      console.error(
        "GET FAMILY CHILD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not load child profile"

        });

    }

  }
);


/* ============================================
   CREATE CHILD
============================================ */

router.post(
  "/",
  async (req,res) => {

    try {

      const payload =
        normalizeChildPayload(
          req.body
        );


      if(
        !payload.firstName ||
        !payload.lastName
      ){

        return res
          .status(400)
          .json({

            message:
              "First name and last name are required"

          });

      }


      if(
        !payload.consentConfirmed
      ){

        return res
          .status(400)
          .json({

            message:
              "Family consent must be confirmed"

          });

      }


      const child =
        await FamilyChild.create({

          familyId:
            req.user._id,

          ...payload,

          consentConfirmedAt:
            new Date(),

          linkStatus:
            "unlinked",

          linkedStudentId:
            null,

          status:
            "active"

        });


      return res
        .status(201)
        .json({

          message:
            "Child profile created",

          child

        });


    } catch(error) {

      console.error(
        "CREATE FAMILY CHILD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not create child profile"

        });

    }

  }
);


/* ============================================
   UPDATE CHILD
============================================ */

router.patch(
  "/:id",
  async (req,res) => {

    try {

      const child =
        await findOwnedChild(
          req,
          req.params.id
        );


      if(!child){

        return res
          .status(404)
          .json({

            message:
              "Child profile not found"

          });

      }


      const payload =
        normalizeChildPayload(
          req.body
        );


      if(
        !payload.firstName ||
        !payload.lastName
      ){

        return res
          .status(400)
          .json({

            message:
              "First name and last name are required"

          });

      }


      /*
        Do not allow this general profile endpoint
        to modify:
        - familyId
        - linkedStudentId
        - linkStatus
        - status
      */

      child.firstName =
        payload.firstName;

      child.lastName =
        payload.lastName;

      child.birthDate =
        payload.birthDate;

      child.profileImage =
        payload.profileImage;

      child.location =
        payload.location;

      child.educationLevel =
        payload.educationLevel;

      child.grade =
        payload.grade;

      child.currentSchool =
        payload.currentSchool;

      child.track =
        payload.track;

      child.goal =
        payload.goal;

      child.interests =
        payload.interests;

      child.notes =
        payload.notes;


      if(
        payload.consentConfirmed &&
        !child.consentConfirmed
      ){

        child.consentConfirmed =
          true;

        child.consentConfirmedAt =
          new Date();

      }


      await child.save();


      return res.json({

        message:
          "Child profile updated",

        child

      });


    } catch(error) {

      console.error(
        "UPDATE FAMILY CHILD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not update child profile"

        });

    }

  }
);


/* ============================================
   LINK EXISTING AIFT STUDENT
============================================ */

router.patch(
  "/:id/link-student",
  async (req,res) => {

    try {

      const child =
        await findOwnedChild(
          req,
          req.params.id
        );


      if(!child){

        return res
          .status(404)
          .json({

            message:
              "Child profile not found"

          });

      }


      const studentId =
        req.body?.studentId;


      if(
        !mongoose.Types.ObjectId
          .isValid(studentId)
      ){

        return res
          .status(400)
          .json({

            message:
              "Valid student ID is required"

          });

      }


      const student =
        await User.findOne({

          _id:
            studentId,

          role:
            "student",

          status: {
            $ne:
              "deactivated"
          }

        })
          .select(
            "_id name email profileImage schoolId course yearLevel role"
          );


      if(!student){

        return res
          .status(404)
          .json({

            message:
              "Student account not found"

          });

      }


      const alreadyLinked =
        await FamilyChild.findOne({

          familyId:
            req.user._id,

          linkedStudentId:
            student._id,

          _id: {
            $ne:
              child._id
          }

        });


      if(alreadyLinked){

        return res
          .status(409)
          .json({

            message:
              "This student is already linked to another child profile"

          });

      }


      child.linkedStudentId =
        student._id;

      child.linkStatus =
        "linked";


      await child.save();


      await child.populate(
        "linkedStudentId",
        "name email profileImage schoolId course yearLevel role"
      );


      return res.json({

        message:
          "Student account linked",

        child

      });


    } catch(error) {

      console.error(
        "LINK FAMILY STUDENT ERROR:",
        error
      );


      if(
        error?.code === 11000
      ){

        return res
          .status(409)
          .json({

            message:
              "This student is already linked"

          });

      }


      return res
        .status(500)
        .json({

          message:
            "Could not link student account"

        });

    }

  }
);


/* ============================================
   UNLINK STUDENT
============================================ */

router.patch(
  "/:id/unlink-student",
  async (req,res) => {

    try {

      const child =
        await findOwnedChild(
          req,
          req.params.id
        );


      if(!child){

        return res
          .status(404)
          .json({

            message:
              "Child profile not found"

          });

      }


      child.linkedStudentId =
        null;

      child.linkStatus =
        "unlinked";


      await child.save();


      return res.json({

        message:
          "Student account unlinked",

        child

      });


    } catch(error) {

      console.error(
        "UNLINK FAMILY STUDENT ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not unlink student account"

        });

    }

  }
);


/* ============================================
   ARCHIVE CHILD
============================================ */

router.delete(
  "/:id",
  async (req,res) => {

    try {

      const child =
        await findOwnedChild(
          req,
          req.params.id
        );


      if(!child){

        return res
          .status(404)
          .json({

            message:
              "Child profile not found"

          });

      }


      /*
        Soft-delete instead of destroying family
        history that may later be referenced by
        scholarship or education requests.
      */

      child.status =
        "archived";


      await child.save();


      return res.json({

        message:
          "Child profile archived"

      });


    } catch(error) {

      console.error(
        "ARCHIVE FAMILY CHILD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Could not archive child profile"

        });

    }

  }
);


module.exports =
  router;
