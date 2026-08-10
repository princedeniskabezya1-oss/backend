const express = require("express");

const router =
  express.Router();

const auth =
  require("../middleware/auth");

const ClassModule =
  require("../models/ClassModule");

const Class =
  require("../models/Class");


/* =========================================================
   ROLE + ID HELPERS
========================================================= */

function normalizeRole(value) {

  const role =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  const aliases = {

    administrator:
      "admin",

    instructor:
      "teacher",

    faculty:
      "teacher",

    learner:
      "student"

  };


  return (
    aliases[role] ||
    role
  );

}


function normalizeObjectId(value) {

  if (!value) {
    return "";
  }


  if (
    typeof value ===
      "object" &&
    value._id
  ) {

    return String(
      value._id
    );

  }


  return String(value);

}


function getUserSchoolIds(user) {

  if (!user) {
    return [];
  }


  const role =
    normalizeRole(
      user.role
    );


  const values = [

    user.schoolId,

    user.linkedSchoolId

  ];


  if (
    role ===
    "school"
  ) {

    values.push(
      user._id
    );

  }


  return [
    ...new Set(
      values
        .map(
          normalizeObjectId
        )
        .filter(Boolean)
    )
  ];

}


/* =========================================================
   CLASS VIEW PERMISSION
========================================================= */

function canViewClass(
  user,
  classDoc
) {

  if (
    !user ||
    !classDoc
  ) {
    return false;
  }


  const role =
    normalizeRole(
      user.role
    );


  const userId =
    normalizeObjectId(
      user._id
    );


  const schoolId =
    normalizeObjectId(
      classDoc.schoolId
    );


  const teacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  const studentIds =
    Array.isArray(
      classDoc.studentIds
    )
      ? classDoc.studentIds
          .map(
            normalizeObjectId
          )
          .filter(Boolean)
      : [];


  if (
    role ===
    "admin"
  ) {
    return true;
  }


  if (
    role ===
    "school"
  ) {

    return getUserSchoolIds(
      user
    ).includes(
      schoolId
    );

  }


  if (
    role ===
    "teacher"
  ) {

    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId ===
        teacherId
    );

  }


  if (
    role ===
    "student"
  ) {

    return (
      Boolean(userId) &&
      studentIds.includes(
        userId
      )
    );

  }


  return false;

}


/* =========================================================
   CLASS INSTRUCTION PERMISSION
========================================================= */

function canManageAssignedClass(
  user,
  classDoc
) {

  if (
    !user ||
    !classDoc
  ) {
    return false;
  }


  const role =
    normalizeRole(
      user.role
    );


  const userId =
    normalizeObjectId(
      user._id
    );


  const schoolId =
    normalizeObjectId(
      classDoc.schoolId
    );


  const teacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  if (
    role ===
    "admin"
  ) {
    return true;
  }


  if (
    role ===
    "school"
  ) {

    return getUserSchoolIds(
      user
    ).includes(
      schoolId
    );

  }


  if (
    role ===
    "teacher"
  ) {

    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId ===
        teacherId
    );

  }


  return false;

}


/* =========================================================
   SAFE FIELD PICKER
========================================================= */

function pick(
  object,
  fields
) {

  const output = {};


  fields.forEach(
    field => {

      if (
        object[field] !==
        undefined
      ) {

        output[field] =
          object[field];

      }

    }
  );


  return output;

}


/* =========================================================
   GET CLASS MODULES

   GET /api/class-modules
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const {
        classId,
        schoolId,
        status
      } = req.query;


      const role =
        normalizeRole(
          req.user.role
        );


      const query = {};


      if (classId) {

        const classDoc =
          await Class.findById(
            classId
          )
            .select(
              "schoolId teacherId studentIds"
            )
            .lean();


        if (!classDoc) {

          return res
            .status(404)
            .json({
              message:
                "Class not found"
            });

        }


        if (
          !canViewClass(
            req.user,
            classDoc
          )
        ) {

          return res
            .status(403)
            .json({
              message:
                "Not allowed to view modules for this class"
            });

        }


        query.classId =
          classId;


        /*
          Students should only receive modules
          intended for the published class experience.
        */

        if (
          role ===
          "student"
        ) {

          query.status =
            "published";

        } else if (status) {

          query.status =
            status;

        }

      } else {

        if (
          role ===
          "admin"
        ) {

          if (schoolId) {

            query.schoolId =
              schoolId;

          }

        } else if (
          role ===
          "school"
        ) {

          query.schoolId =
            normalizeObjectId(
              req.user._id
            );

        } else if (
          role ===
          "teacher"
        ) {

          const classes =
            await Class.find({
              teacherId:
                req.user._id
            })
              .select("_id")
              .lean();


          query.classId = {
            $in:
              classes.map(
                item =>
                  item._id
              )
          };


          if (status) {

            query.status =
              status;

          }

        } else if (
          role ===
          "student"
        ) {

          const classes =
            await Class.find({
              studentIds:
                req.user._id
            })
              .select("_id")
              .lean();


          query.classId = {
            $in:
              classes.map(
                item =>
                  item._id
              )
          };


          query.status =
            "published";

        } else {

          return res
            .status(403)
            .json({
              message:
                "Not allowed to view class modules"
            });

        }

      }


      const modules =
        await ClassModule.find(
          query
        )
          .sort({
            order:1,
            createdAt:1
          })
          .lean();


      return res.json(
        modules
      );


    } catch (err) {

      console.error(
        "GET class modules error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load class modules"
        });

    }

  }
);


/* =========================================================
   CREATE CLASS MODULE

   POST /api/class-modules
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const {
        classId,
        title
      } = req.body;


      if (
        !classId ||
        !String(
          title ||
          ""
        ).trim()
      ) {

        return res
          .status(400)
          .json({
            message:
              "classId and title are required"
          });

      }


      const classDoc =
        await Class.findById(
          classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to create modules for this class"
          });

      }


      const module =
        await ClassModule.create({

          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          title:
            String(
              title
            ).trim(),

          description:
            req.body.description ||
            "",

          order:
            Number(
              req.body.order ||
              0
            ),

          status:
            [
              "draft",
              "published",
              "archived"
            ].includes(
              req.body.status
            )
              ? req.body.status
              : "draft",

          isLocked:
            Boolean(
              req.body.isLocked
            )

        });


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "module:new",
            module
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "module:new",
              module
            );

        }

      }


      return res
        .status(201)
        .json(
          module
        );


    } catch (err) {

      console.error(
        "POST class module error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to create class module"
        });

    }

  }
);


/* =========================================================
   UPDATE CLASS MODULE

   PATCH /api/class-modules/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const module =
        await ClassModule.findById(
          req.params.id
        );


      if (!module) {

        return res
          .status(404)
          .json({
            message:
              "Class module not found"
          });

      }


      const classDoc =
        await Class.findById(
          module.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this module"
          });

      }


      const updates =
        pick(
          req.body,
          [
            "title",
            "description",
            "order",
            "status",
            "isLocked"
          ]
        );


      Object.entries(
        updates
      ).forEach(
        ([
          field,
          value
        ]) => {

          module[field] =
            value;

        }
      );


      await module.save();


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "module:updated",
            module
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "module:updated",
              module
            );

        }

      }


      return res.json(
        module
      );


    } catch (err) {

      console.error(
        "PATCH class module error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to update class module"
        });

    }

  }
);


/* =========================================================
   DELETE CLASS MODULE

   DELETE /api/class-modules/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const module =
        await ClassModule.findById(
          req.params.id
        );


      if (!module) {

        return res
          .status(404)
          .json({
            message:
              "Class module not found"
          });

      }


      const classDoc =
        await Class.findById(
          module.classId
        );


      if (!classDoc) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to delete this module"
          });

      }


      const moduleId =
        module._id;


      await module.deleteOne();


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        const payload = {

          moduleId:
            String(
              moduleId
            ),

          classId:
            String(
              classDoc._id
            )

        };


        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "module:deleted",
            payload
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "module:deleted",
              payload
            );

        }

      }


      return res.json({

        message:
          "Class module deleted",

        moduleId:
          String(
            moduleId
          )

      });


    } catch (err) {

      console.error(
        "DELETE class module error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to delete class module"
        });

    }

  }
);


module.exports =
  router;
