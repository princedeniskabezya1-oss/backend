const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Class = require("../models/Class");


/* ============================================
   ASSIGNMENT FILE UPLOAD CONFIG
============================================ */

const ASSIGNMENT_MAX_FILE_SIZE =
  100 * 1024 * 1024;


const ASSIGNMENT_ALLOWED_EXTENSIONS =
  new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",

    "mp4",
    "webm",
    "mov",
    "m4v",

    "mp3",
    "wav",
    "m4a",
    "ogg",

    "pdf",

    "doc",
    "docx",

    "ppt",
    "pptx",

    "xls",
    "xlsx",

    "csv",
    "txt",
    "rtf",

    "zip"
  ]);


/* ============================================
   FILE EXTENSION
============================================ */

function getAssignmentFileExtension(
  fileName
) {

  const value =
    String(
      fileName ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !value.includes(".")
  ) {

    return "";

  }


  return value
    .split(".")
    .pop()
    .trim();

}


/* ============================================
   VALIDATE ASSIGNMENT ATTACHMENT
============================================ */

function validateAssignmentAttachment(
  file
) {

  if (!file) {

    return true;

  }


  if (
    Number(file.size || 0) >
    ASSIGNMENT_MAX_FILE_SIZE
  ) {

    const error =
      new Error(
        "Assignment attachment exceeds the 100 MB limit."
      );


    error.status =
      413;


    throw error;

  }


  const extension =
    getAssignmentFileExtension(
      file.originalname
    );


  if (
    !ASSIGNMENT_ALLOWED_EXTENSIONS.has(
      extension
    )
  ) {

    const error =
      new Error(
        "This attachment type is not supported."
      );


    error.status =
      400;


    throw error;

  }


  return true;

}


/* ============================================
   UPLOAD ASSIGNMENT ATTACHMENT TO CLOUDINARY
============================================ */

function uploadAssignmentAttachment(
  file
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      if (!file) {

        resolve(null);

        return;

      }


      try {

        validateAssignmentAttachment(
          file
        );

      } catch (error) {

        reject(error);

        return;

      }


      const extension =
        getAssignmentFileExtension(
          file.originalname
        );


      const originalBaseName =
        String(
          file.originalname ||
          "assignment-file"
        )
          .replace(
            /\.[^/.]+$/,
            ""
          )
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            "-"
          )
          .replace(
            /^[-_]+|[-_]+$/g,
            ""
          )
          .slice(
            0,
            80
          ) ||
        "assignment-file";


      const uploadStream =
        cloudinary
          .uploader
          .upload_stream(
            {
              folder:
                "aift_assignments",

              resource_type:
                "auto",

              use_filename:
                true,

              unique_filename:
                true,

              filename_override:
                `${originalBaseName}.${extension}`
            },
            (
              error,
              result
            ) => {

              if (error) {

                reject(error);

                return;

              }


              resolve({
                url:
                  result.secure_url,

                publicId:
                  result.public_id,

                resourceType:
                  result.resource_type,

                format:
                  result.format ||
                  extension ||
                  null,

                bytes:
                  result.bytes ||
                  Number(file.size || 0),

                originalName:
                  file.originalname ||
                  null
              });

            }
          );


      uploadStream.end(
        file.buffer
      );

    }
  );

}


/* ============================================
   ASSIGNMENT ACCESS HELPERS
============================================ */

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    administrator: "admin",
    instructor: "teacher",
    faculty: "teacher",
    learner: "student"
  };

  return aliases[role] || role;
}


function normalizeObjectId(value) {
  if (!value) {
    return "";
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return String(value._id);
  }

  return String(value);
}


function getUserSchoolIds(user) {
  if (!user) {
    return [];
  }

  const role = normalizeRole(user.role);

  const candidates = [
    user.schoolId,
    user.linkedSchoolId
  ];

  if (role === "school") {
    candidates.push(user._id);
  }

  return [
    ...new Set(
      candidates
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
}


function getUserSchoolId(user) {
  return getUserSchoolIds(user)[0] || null;
}


function canManageSchool(
  user,
  schoolId
) {
  if (
    !user ||
    !schoolId
  ) {
    return false;
  }

  const role =
    normalizeRole(
      user.role
    );

  if (role === "admin") {
    return true;
  }

  if (role !== "school") {
    return false;
  }

  return getUserSchoolIds(user)
    .includes(
      normalizeObjectId(
        schoolId
      )
    );
}


/* ============================================
   ASSIGNED CLASS PERMISSION
============================================ */

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

  const classSchoolId =
    normalizeObjectId(
      classDoc.schoolId
    );

  const classTeacherId =
    normalizeObjectId(
      classDoc.teacherId
    );

  if (role === "admin") {
    return true;
  }

  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(
        classSchoolId
      );
  }

  if (role === "teacher") {
    return (
      Boolean(userId) &&
      Boolean(classTeacherId) &&
      userId ===
        classTeacherId
    );
  }

  return false;
}


/* ============================================
   ASSIGNMENT PERMISSION
============================================ */

async function canManageAssignment(
  user,
  assignment
) {
  if (
    !user ||
    !assignment
  ) {
    return false;
  }

  const role =
    normalizeRole(
      user.role
    );

  if (role === "admin") {
    return true;
  }

  /*
    School owner may manage assignments
    belonging to its own school.
  */
  if (role === "school") {
    return canManageSchool(
      user,
      assignment.schoolId
    );
  }

  if (role !== "teacher") {
    return false;
  }

  /*
    Class-based assignments are controlled by
    the teacher currently assigned to that class.

    This remains secure even if teacherId on an
    old assignment is missing or outdated.
  */
  if (assignment.classId) {
    const classDoc =
      await Class.findById(
        assignment.classId
      )
        .select(
          "schoolId teacherId"
        )
        .lean();

    if (!classDoc) {
      return false;
    }

    return canManageAssignedClass(
      user,
      classDoc
    );
  }

  /*
    Legacy assignment with no class:

    Only its explicitly assigned teacher may
    manage it.
  */
  const assignmentTeacherId =
    normalizeObjectId(
      assignment.teacherId
    );

  return (
    Boolean(
      assignmentTeacherId
    ) &&
    assignmentTeacherId ===
      normalizeObjectId(
        user._id
      )
  );
}
/* ============================================
   GET ASSIGNMENTS
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

    const schoolId =
      req.query.schoolId ||
      getUserSchoolId(user);

    const query = {};

    const role =
      normalizeRole(user.role);

    if (role === "admin") {
      if (req.query.schoolId) {
        query.schoolId =
          req.query.schoolId;
      }
    } else if (role === "school") {
      query.schoolId =
        getUserSchoolId(user);
} else if (role === "teacher") {

  /*
    Teachers may only load assignments that belong to them.

    Do NOT return every assignment from the teacher's school.
    School users retain school-wide visibility.
  */

  query.teacherId =
    user._id;
    } else if (role === "student") {
      const studentSchoolIds =
        getUserSchoolIds(user);

      if (!studentSchoolIds.length) {
        return res.status(403).json({
          message: "Student is not linked to a school"
        });
      }

      query.schoolId = {
        $in: studentSchoolIds
      };
    } else {
      return res.status(403).json({
        message: "Not allowed to view assignments"
      });
    }

    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.teacherId) query.teacherId = req.query.teacherId;

    const assignments = await Assignment.find(query)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject")
      .sort({ dueDate: 1, createdAt: -1 });

    res.json(assignments);
  } catch (err) {
    console.error("GET /api/assignments error:", err);
    res.status(500).json({ message: "Failed to load assignments" });
  }
});

/* ============================================
   CREATE ASSIGNMENT
============================================ */

router.post(
  "/",
  auth,
  upload.single(
    "attachment"
  ),
  async (
    req,
    res
  ) => {

    try {

      const {
        schoolId,
        classId,
        teacherId,
        title,
        instructions,
        description,
        dueDate,
        status
      } =
        req.body;


      const role =
        normalizeRole(
          req.user.role
        );


      /* ========================================
         BASIC VALIDATION
      ======================================== */

      const cleanTitle =
        String(
          title ||
          ""
        )
          .trim();


      if (!cleanTitle) {

        return res
          .status(400)
          .json({
            message:
              "Assignment title is required"
          });

      }


      /* ========================================
         CLASS + SCHOOL AUTHORIZATION
      ======================================== */

      let classDoc =
        null;


      let finalSchoolId =
        null;


      if (classId) {

        classDoc =
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
                "Not allowed to create assignments for this class"
            });

        }


        /*
          Never trust schoolId from the browser when a real
          class exists.

          The class decides which school owns the assignment.
        */

        finalSchoolId =
          classDoc.schoolId;

      } else {

        finalSchoolId =
          role ===
            "school"
            ? getUserSchoolId(
                req.user
              )
            : schoolId ||
              getUserSchoolId(
                req.user
              );


        if (!finalSchoolId) {

          return res
            .status(400)
            .json({
              message:
                "School ID is required"
            });

        }


        if (
          !canManageSchool(
            req.user,
            finalSchoolId
          )
        ) {

          return res
            .status(403)
            .json({
              message:
                "A teacher must create assignments inside an assigned class."
            });

        }

      }


      /* ========================================
         FILE VALIDATION
      ======================================== */

      if (req.file) {

        validateAssignmentAttachment(
          req.file
        );

      }


      /* ========================================
         CLOUDINARY UPLOAD
      ======================================== */

      let uploadedAttachment =
        null;


      if (req.file) {

        uploadedAttachment =
          await uploadAssignmentAttachment(
            req.file
          );

      }


      /* ========================================
         NORMALIZE STATUS
      ======================================== */

      const requestedStatus =
        String(
          status ||
          "draft"
        )
          .trim()
          .toLowerCase();


      const finalStatus =
        [
          "draft",
          "published",
          "closed"
        ].includes(
          requestedStatus
        )
          ? requestedStatus
          : "draft";


      /* ========================================
         CREATE ASSIGNMENT
      ======================================== */

      const assignment =
        await Assignment.create({

          schoolId:
            finalSchoolId,

          classId:
            classId ||
            null,

          teacherId:
            role ===
              "teacher"
              ? req.user._id
              : (
                  teacherId ||
                  classDoc?.teacherId ||
                  null
                ),

          title:
            cleanTitle,

          instructions:
            instructions ||
            description ||
            null,

          description:
            description ||
            instructions ||
            null,

          dueDate:
            dueDate ||
            null,

          status:
            finalStatus,

          attachmentUrl:
            uploadedAttachment?.url ||
            null

        });


      /* ========================================
         POPULATE RESPONSE
      ======================================== */

      const populated =
        await Assignment
          .findById(
            assignment._id
          )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          );


      /* ========================================
         REALTIME
      ======================================== */

      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              finalSchoolId
            )
          )
          .emit(
            "assignment:new",
            populated
          );


        if (
          populated.teacherId?._id
        ) {

          io
            .to(
              String(
                populated.teacherId._id
              )
            )
            .emit(
              "assignment:new",
              populated
            );

        }

      }


      return res
        .status(201)
        .json(
          populated
        );

    } catch (err) {

      console.error(
        "POST /api/assignments error:",
        err
      );


      if (
        Number(
          err?.status
        ) ===
        413
      ) {

        return res
          .status(413)
          .json({
            message:
              err.message ||
              "Assignment attachment is too large"
          });

      }


      if (
        Number(
          err?.status
        ) ===
        400
      ) {

        return res
          .status(400)
          .json({
            message:
              err.message ||
              "Invalid assignment attachment"
          });

      }


      return res
        .status(500)
        .json({
          message:
            "Failed to create assignment",

          error:
            err.message
        });

    }

  }
);


/* ============================================
   UPDATE ASSIGNMENT
============================================ */

router.patch(
  "/:id",
  auth,
  upload.single(
    "attachment"
  ),
  async (
    req,
    res
  ) => {

    try {

      /* ========================================
         FIND ASSIGNMENT
      ======================================== */

      const assignment =
        await Assignment.findById(
          req.params.id
        );


      if (!assignment) {

        return res
          .status(404)
          .json({
            message:
              "Assignment not found"
          });

      }


      /* ========================================
         PERMISSION
      ======================================== */

      if (
        !await canManageAssignment(
          req.user,
          assignment
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this assignment"
          });

      }


      const role =
        normalizeRole(
          req.user.role
        );


      /* ========================================
         CLASS CHANGE
      ======================================== */

      if (
        req.body.classId !==
        undefined
      ) {

        const requestedClassId =
          String(
            req.body.classId ||
            ""
          )
            .trim();


        if (!requestedClassId) {

          assignment.classId =
            null;

        } else {

          const classDoc =
            await Class.findById(
              requestedClassId
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
                  "Not allowed to assign work to this class"
              });

          }


          assignment.classId =
            classDoc._id;


          /*
            Class is authoritative for the school's ownership.
          */

          assignment.schoolId =
            classDoc.schoolId;


          if (
            role ===
            "teacher"
          ) {

            assignment.teacherId =
              req.user._id;

          }

        }

      }


      /* ========================================
         TITLE
      ======================================== */

      if (
        req.body.title !==
        undefined
      ) {

        assignment.title =
          String(
            req.body.title ||
            ""
          )
            .trim();

      }


      if (!assignment.title) {

        return res
          .status(400)
          .json({
            message:
              "Assignment title is required"
          });

      }


      /* ========================================
         INSTRUCTIONS
      ======================================== */

      if (
        req.body.instructions !==
        undefined
      ) {

        assignment.instructions =
          req.body.instructions ||
          null;

      }


      if (
        req.body.description !==
        undefined
      ) {

        assignment.description =
          req.body.description ||
          null;

      }


      /* ========================================
         DUE DATE
      ======================================== */

      if (
        req.body.dueDate !==
        undefined
      ) {

        assignment.dueDate =
          req.body.dueDate ||
          null;

      }


      /* ========================================
         STATUS
      ======================================== */

      if (
        req.body.status !==
        undefined
      ) {

        const requestedStatus =
          String(
            req.body.status ||
            ""
          )
            .trim()
            .toLowerCase();


        if (
          ![
            "draft",
            "published",
            "closed"
          ].includes(
            requestedStatus
          )
        ) {

          return res
            .status(400)
            .json({
              message:
                "Invalid assignment status"
            });

        }


        assignment.status =
          requestedStatus;

      }


      /* ========================================
         SCHOOL / ADMIN TEACHER REASSIGNMENT
      ======================================== */

      if (
        (
          role ===
            "school" ||
          role ===
            "admin"
        ) &&
        req.body.teacherId !==
          undefined
      ) {

        assignment.teacherId =
          req.body.teacherId ||
          null;

      }


      /* ========================================
         REMOVE EXISTING ATTACHMENT
      ======================================== */

      const removeAttachment =
        String(
          req.body.removeAttachment ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "true";


      if (removeAttachment) {

        assignment.attachmentUrl =
          null;

      }


      /* ========================================
         VALIDATE NEW FILE
      ======================================== */

      if (req.file) {

        validateAssignmentAttachment(
          req.file
        );

      }


      /* ========================================
         REPLACE WITH NEW DEVICE FILE
      ======================================== */

      if (req.file) {

        const uploadedAttachment =
          await uploadAssignmentAttachment(
            req.file
          );


        assignment.attachmentUrl =
          uploadedAttachment?.url ||
          null;

      }


      /* ========================================
         ENSURE TEACHER OWNERSHIP
      ======================================== */

      if (
        role ===
        "teacher"
      ) {

        assignment.teacherId =
          req.user._id;

      }


      /* ========================================
         SAVE
      ======================================== */

      await assignment.save();


      /* ========================================
         POPULATE
      ======================================== */

      const populated =
        await Assignment
          .findById(
            assignment._id
          )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          );


      /* ========================================
         REALTIME
      ======================================== */

      const io =
        req.app.get(
          "io"
        );


      if (io) {

        io
          .to(
            String(
              assignment.schoolId
            )
          )
          .emit(
            "assignment:updated",
            populated
          );


        if (
          populated.teacherId?._id
        ) {

          io
            .to(
              String(
                populated.teacherId._id
              )
            )
            .emit(
              "assignment:updated",
              populated
            );

        }

      }


      return res.json(
        populated
      );

    } catch (err) {

      console.error(
        "PATCH /api/assignments/:id error:",
        err
      );


      if (
        Number(
          err?.status
        ) ===
        413
      ) {

        return res
          .status(413)
          .json({
            message:
              err.message ||
              "Assignment attachment is too large"
          });

      }


      if (
        Number(
          err?.status
        ) ===
        400
      ) {

        return res
          .status(400)
          .json({
            message:
              err.message ||
              "Invalid assignment attachment"
          });

      }


      return res
        .status(500)
        .json({
          message:
            "Failed to update assignment",

          error:
            err.message
        });

    }

  }
);

/* ============================================
   DELETE ASSIGNMENT
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const assignment =
      await Assignment.findById(
        req.params.id
      );

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found"
      });
    }

    if (
      !await canManageAssignment(
        req.user,
        assignment
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to delete this assignment"
      });
    }

    const assignmentId =
      assignment._id;

    /*
      Remove dependent submission records before deleting
      the assignment so the database does not retain orphaned
      student work pointing to a missing assignment.
    */
    const submissionDeleteResult =
      await Submission.deleteMany({
        assignmentId
      });

    await assignment.deleteOne();

    const io =
      req.app.get("io");

    if (io) {
      const payload = {
        assignmentId:
          String(assignmentId),

        classId:
          assignment.classId
            ? String(assignment.classId)
            : null,

        deletedSubmissionCount:
          submissionDeleteResult.deletedCount ||
          0
      };

      io
        .to(
          String(
            assignment.schoolId
          )
        )
        .emit(
          "assignment:deleted",
          payload
        );

      if (assignment.teacherId) {
        io
          .to(
            String(
              assignment.teacherId
            )
          )
          .emit(
            "assignment:deleted",
            payload
          );
      }
    }

    return res.json({
      message: "Assignment deleted",
      assignmentId:
        String(assignmentId),
      deletedSubmissionCount:
        submissionDeleteResult.deletedCount ||
        0
    });
  } catch (err) {
    console.error(
      "DELETE /api/assignments/:id error:",
      err
    );

    return res.status(500).json({
      message: "Failed to delete assignment"
    });
  }
});

module.exports = router;
