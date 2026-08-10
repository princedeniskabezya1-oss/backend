const express = require("express");

const router =
  express.Router();

const auth =
  require("../middleware/auth");

const ClassLesson =
  require("../models/ClassLesson");

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


  /*
    ADMIN
  */

  if (
    role ===
    "admin"
  ) {
    return true;
  }


  /*
    SCHOOL OWNER
  */

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


  /*
    ASSIGNED TEACHER ONLY
  */

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
   GET CLASS LESSONS

   GET /api/class-lessons
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
        moduleId,
        schoolId,
        status
      } = req.query;


      const role =
        normalizeRole(
          req.user.role
        );


      const query = {};


      /* =====================================================
         CLASS-SCOPED REQUEST
      ===================================================== */

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
                "Not allowed to view lessons for this class"
            });

        }


        query.classId =
          classId;


        /*
          Students can never retrieve draft
          or archived lessons through this API.
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

        /* ===================================================
           NON CLASS-SCOPED REQUEST

           Keep results scoped to the authenticated account.
        =================================================== */

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
                "Not allowed to view class lessons"
            });

        }

      }


      if (moduleId) {

        query.moduleId =
          moduleId;

      }


      const lessons =
        await ClassLesson.find(
          query
        )
          .sort({
            order:1,
            createdAt:1
          })
          .lean();


      return res.json(
        lessons
      );


    } catch (err) {

      console.error(
        "GET class lessons error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load class lessons"
        });

    }

  }
);


/* =========================================================
   CREATE CLASS LESSON

   POST /api/class-lessons
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
              "Not allowed to create lessons for this class"
          });

      }


      /*
        IMPORTANT:

        schoolId is taken from the actual class,
        not trusted from req.body.
      */

      const lesson =
        await ClassLesson.create({

          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          moduleId:
            req.body.moduleId ||
            null,

          title:
            String(
              title
            ).trim(),

          summary:
            req.body.summary ||
            "",

          content:
            req.body.content ||
            "",

          videoUrl:
            req.body.videoUrl ||
            "",

          coverUrl:
            req.body.coverUrl ||
            "",

          resources:
            Array.isArray(
              req.body.resources
            )
              ? req.body.resources
              : [],

          order:
            Number(
              req.body.order ||
              0
            ),

          durationMinutes:
            Number(
              req.body
                .durationMinutes ||
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

          previewEnabled:
            Boolean(
              req.body
                .previewEnabled
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
            "lesson:new",
            lesson
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
              "lesson:new",
              lesson
            );

        }

      }


      return res
        .status(201)
        .json(
          lesson
        );


    } catch (err) {

      console.error(
        "POST class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to create class lesson"
        });

    }

  }
);


/* =========================================================
   UPDATE CLASS LESSON

   PATCH /api/class-lessons/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const lesson =
        await ClassLesson.findById(
          req.params.id
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      const classDoc =
        await Class.findById(
          lesson.classId
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
              "Not allowed to update this lesson"
          });

      }


      const updates =
        pick(
          req.body,
          [
            "moduleId",
            "title",
            "summary",
            "content",
            "videoUrl",
            "coverUrl",
            "resources",
            "order",
            "durationMinutes",
            "status",
            "previewEnabled"
          ]
        );


      /*
        Immutable ownership fields cannot be changed
        through this endpoint.

        schoolId and classId remain tied to the
        original class.
      */

      Object.entries(
        updates
      ).forEach(
        ([
          field,
          value
        ]) => {

          lesson[field] =
            value;

        }
      );


      await lesson.save();


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
            "lesson:updated",
            lesson
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
              "lesson:updated",
              lesson
            );

        }

      }


      return res.json(
        lesson
      );


    } catch (err) {

      console.error(
        "PATCH class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to update class lesson"
        });

    }

  }
);


/* =========================================================
   DELETE CLASS LESSON

   DELETE /api/class-lessons/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const lesson =
        await ClassLesson.findById(
          req.params.id
        );


      if (!lesson) {

        return res
          .status(404)
          .json({
            message:
              "Class lesson not found"
          });

      }


      const classDoc =
        await Class.findById(
          lesson.classId
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
              "Not allowed to delete this lesson"
          });

      }


      const lessonId =
        lesson._id;


      await lesson.deleteOne();


      const io =
        req.app.get(
          "io"
        );


      if (io) {

        const payload = {

          lessonId:
            String(
              lessonId
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
            "lesson:deleted",
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
              "lesson:deleted",
              payload
            );

        }

      }


      return res.json({

        message:
          "Class lesson deleted",

        lessonId:
          String(
            lessonId
          )

      });


    } catch (err) {

      console.error(
        "DELETE class lesson error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to delete class lesson"
        });

    }

  }
);


module.exports =
  router;
