const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const Class = require("../models/Class");
const { createManyNotifications, createNotification } = require("../services/notificationService");

function normalizeRole(value) {
  const role =
    String(value || "")
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

  const role =
    normalizeRole(user.role);

  const values = [
    user.schoolId,
    user.linkedSchoolId
  ];

  if (role === "school") {
    values.push(user._id);
  }

  return [
    ...new Set(
      values
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
}


function canViewSchool(
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

  return getUserSchoolIds(user)
    .includes(
      normalizeObjectId(
        schoolId
      )
    );
}


/* ============================================
   ASSIGNED CLASS ACCESS
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
      userId === classTeacherId
    );
  }

  return false;
}

const MAX_SUBMISSION_ATTACHMENTS =
  20;

const ALLOWED_ATTACHMENT_TYPES =
  new Set([
    "image",
    "video",
    "audio",
    "pdf",
    "document",
    "presentation",
    "spreadsheet",
    "text",
    "file"
  ]);

const ALLOWED_RESOURCE_TYPES =
  new Set([
    "image",
    "video",
    "raw"
  ]);


function sanitizeSubmissionAttachments(
  attachments,
  userId
) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  const uniqueUrls =
    new Set();

  return attachments
    .slice(
      0,
      MAX_SUBMISSION_ATTACHMENTS
    )
    .map(attachment => {
      const url =
        String(
          attachment?.secureUrl ||
          attachment?.url ||
          ""
        ).trim();

      if (!url) {
        return null;
      }

      let parsedUrl;

      try {
        parsedUrl =
          new URL(url);
      } catch {
        return null;
      }

      if (
        ![
          "http:",
          "https:"
        ].includes(
          parsedUrl.protocol
        )
      ) {
        return null;
      }

      if (
        uniqueUrls.has(url)
      ) {
        return null;
      }

      uniqueUrls.add(url);

      const attachmentType =
        String(
          attachment?.attachmentType ||
          "file"
        )
          .trim()
          .toLowerCase();

      const resourceType =
        String(
          attachment?.resourceType ||
          "raw"
        )
          .trim()
          .toLowerCase();

      return {
        url,

        secureUrl:
          String(
            attachment?.secureUrl ||
            url
          ).trim(),

        publicId:
          String(
            attachment?.publicId ||
            ""
          )
            .trim()
            .slice(
              0,
              500
            ),

        originalName:
          String(
            attachment?.originalName ||
            "Attachment"
          )
            .trim()
            .slice(
              0,
              255
            ),

        mimeType:
          String(
            attachment?.mimeType ||
            "application/octet-stream"
          )
            .trim()
            .slice(
              0,
              150
            ),

        attachmentType:
          ALLOWED_ATTACHMENT_TYPES.has(
            attachmentType
          )
            ? attachmentType
            : "file",

        resourceType:
          ALLOWED_RESOURCE_TYPES.has(
            resourceType
          )
            ? resourceType
            : "raw",

        size:
          Math.max(
            0,
            Number(
              attachment?.size ||
              0
            ) || 0
          ),

        format:
          String(
            attachment?.format ||
            ""
          )
            .trim()
            .slice(
              0,
              50
            ),

        width:
          Number.isFinite(
            Number(
              attachment?.width
            )
          )
            ? Number(
                attachment.width
              )
            : null,

        height:
          Number.isFinite(
            Number(
              attachment?.height
            )
          )
            ? Number(
                attachment.height
              )
            : null,

        duration:
          Number.isFinite(
            Number(
              attachment?.duration
            )
          )
            ? Number(
                attachment.duration
              )
            : null,

        uploadedBy:
          userId,

        uploadedAt:
          attachment?.uploadedAt
            ? new Date(
                attachment.uploadedAt
              )
            : new Date()
      };
    })
    .filter(Boolean);
}

async function canGrade(
  user,
  submission
) {
  if (
    !user ||
    !submission
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

  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(
        normalizeObjectId(
          submission.schoolId
        )
      );
  }

  if (role !== "teacher") {
    return false;
  }

  /*
    Prefer the actual class assignment.

    This prevents an old/stale submission.teacherId
    from giving access after a teacher has been
    replaced on the class.
  */
  if (submission.classId) {
    const classDoc =
      await Class.findById(
        submission.classId
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
    Legacy submission without a class.
  */
  return (
    normalizeObjectId(
      submission.teacherId
    ) ===
    normalizeObjectId(
      user._id
    )
  );
}

/* ============================================
   GET SUBMISSIONS
============================================ */

router.get(
  "/",
  auth,
  async (req, res) => {
    try {

      const user =
        req.user;

      const role =
        normalizeRole(
          user.role
        );

      const query = {};


      /* ========================================
         ADMIN
      ======================================== */

      if (role === "admin") {

        if (
          req.query.schoolId
        ) {
          query.schoolId =
            req.query.schoolId;
        }

      }


      /* ========================================
         SCHOOL
      ======================================== */

      else if (
        role === "school"
      ) {

        query.schoolId =
          user._id;

      }


      /* ========================================
         TEACHER

         Teacher only sees submissions from
         classes currently assigned to them.
      ======================================== */

      else if (
        role === "teacher"
      ) {

        const assignedClasses =
          await Class.find({
            teacherId:
              user._id
          })
            .select("_id")
            .lean();


        const assignedClassIds =
          assignedClasses.map(
            item =>
              item._id
          );


        /*
          Also retain explicitly teacher-owned
          legacy submissions that may not have
          classId.
        */

        query.$or = [
          {
            classId: {
              $in:
                assignedClassIds
            }
          },
          {
            classId:null,
            teacherId:
              user._id
          }
        ];

      }


      /* ========================================
         STUDENT
      ======================================== */

      else if (
        role === "student"
      ) {

        query.studentId =
          user._id;

      }


      else {

        return res.status(403).json({
          message:
            "Not allowed to view submissions"
        });

      }


      /* ========================================
         OPTIONAL FILTERS
      ======================================== */

      if (
        req.query.assignmentId
      ) {

        query.assignmentId =
          req.query.assignmentId;

      }


      if (
        req.query.classId
      ) {

        /*
          Teacher classId filters must still
          refer to one of their assigned classes.
        */

        if (
          role === "teacher"
        ) {

          const classDoc =
            await Class.findById(
              req.query.classId
            )
              .select(
                "schoolId teacherId"
              )
              .lean();


          if (!classDoc) {

            return res.status(404).json({
              message:
                "Class not found"
            });

          }


          if (
            !canManageAssignedClass(
              user,
              classDoc
            )
          ) {

            return res.status(403).json({
              message:
                "Not allowed to view submissions for this class"
            });

          }


          /*
            Replace the broader $or with the
            explicitly authorized class filter.
          */

          delete query.$or;

        }


        if (
          role === "student"
        ) {

          const classDoc =
            await Class.findOne({
              _id:
                req.query.classId,

              studentIds:
                user._id
            })
              .select("_id")
              .lean();


          if (!classDoc) {

            return res.status(403).json({
              message:
                "Not enrolled in this class"
            });

          }

        }


        query.classId =
          req.query.classId;

      }


      /*
        Student ID filters must never let a
        student request another student's work.
      */

      if (
        req.query.studentId &&
        role !== "student"
      ) {

        query.studentId =
          req.query.studentId;

      }


      /*
        Teachers cannot use teacherId query
        to inspect another teacher's records.
      */

      if (
        req.query.teacherId
      ) {

        if (
          role === "teacher" &&
          normalizeObjectId(
            req.query.teacherId
          ) !==
          normalizeObjectId(
            user._id
          )
        ) {

          return res.status(403).json({
            message:
              "Not allowed to view another teacher's submissions"
          });

        }


        query.teacherId =
          role === "teacher"
            ? user._id
            : req.query.teacherId;

      }


      const submissions =
        await Submission.find(
          query
        )
          .populate(
            "assignmentId",
            "title dueDate"
          )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "studentId",
            "name email profileImage course"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          )
          .sort({
            submittedAt:-1,
            createdAt:-1
          });


      return res.json(
        submissions
      );

    } catch (err) {

      console.error(
        "GET /api/submissions error:",
        err
      );


      return res.status(500).json({
        message:
          "Failed to load submissions"
      });

    }
  }
);

/* ============================================
   CREATE / SUBMIT ASSIGNMENT
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const assignmentId =
      String(
        req.body.assignmentId || ""
      ).trim();

    const text =
      String(
        req.body.text || ""
      ).trim();

const fileUrl =
  String(
    req.body.fileUrl || ""
  ).trim();

const attachments =
  sanitizeSubmissionAttachments(
    req.body.attachments,
    req.user._id
  );

    if (!assignmentId) {
      return res.status(400).json({
        message:
          "Assignment ID is required"
      });
    }

if (
  !text &&
  !fileUrl &&
  !attachments.length
) {
      return res.status(400).json({
        message:
  "Write an answer or attach at least one file"
      });
    }

    if (
      req.user.role !==
      "student"
    ) {
      return res.status(403).json({
        message:
          "Only students can submit assignments"
      });
    }

    const assignment =
      await Assignment.findById(
        assignmentId
      );

    if (!assignment) {
      return res.status(404).json({
        message:
          "Assignment not found"
      });
    }

    if (
      !canViewSchool(
        req.user,
        assignment.schoolId
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to submit this assignment"
      });
    }

    const existing =
      await Submission.findOne({
        assignmentId:
          assignment._id,

        studentId:
          req.user._id
      });

    const now =
      new Date();

    let submission;
    let socketEvent;
    let responseStatus;

if (!existing) {
  const primaryFileUrl =
    fileUrl ||
    attachments[0]?.url ||
    null;

  submission =
    await Submission.create({
      schoolId:
        assignment.schoolId,

      classId:
        assignment.classId ||
        null,

      assignmentId:
        assignment._id,

      studentId:
        req.user._id,

      teacherId:
        assignment.teacherId ||
        null,

      text:
        text || null,

      /*
        Keep fileUrl for backward compatibility.

        The first uploaded attachment becomes the legacy
        fileUrl when no manually supplied URL exists.
      */

      fileUrl:
        primaryFileUrl,

      /*
        This is now the real multi-file source.
      */

      attachments,

      status:
        "submitted",

      submittedAt:
        now,

      lastEditedAt:
        now,

      attemptNumber:
        1,

      revisionNumber:
        1,

      submissionHistory: [
        {
          revisionNumber:
            1,

          attemptNumber:
            1,

          text:
            text || null,

          fileUrl:
            primaryFileUrl,

          /*
            Store a snapshot of the files belonging to
            this exact revision.
          */

          attachments,

          status:
            "submitted",

          grade:
            null,

          feedback:
            null,

          changedBy:
            req.user._id,

          changedByRole:
            req.user.role,

          action:
            "submitted",

          createdAt:
            now
        }
      ]
    });

  socketEvent =
    "submission:new";

  responseStatus =
    201;
} else {
      const currentStatus =
        String(
          existing.status || ""
        )
          .trim()
          .toLowerCase();

      const isLocked =
        existing.locked === true ||
        [
          "graded",
          "reviewed",
          "locked"
        ].includes(
          currentStatus
        ) ||
        (
          existing.grade !==
            undefined &&
          existing.grade !==
            null &&
          existing.grade !== ""
        );

      if (isLocked) {
        return res.status(403).json({
          message:
            "This submission has already been reviewed and can no longer be modified"
        });
      }

      const isResubmission =
        currentStatus ===
        "returned";


const primaryFileUrl =
  fileUrl ||
  attachments[0]?.url ||
  null;

existing.schoolId =
  assignment.schoolId;

existing.classId =
  assignment.classId ||
  null;

existing.teacherId =
  assignment.teacherId ||
  null;

existing.text =
  text || null;

/*
  Keep the old field synchronized for backward
  compatibility with older frontend code.
*/

existing.fileUrl =
  primaryFileUrl;

/*
  Replace the current submission files with the exact
  attachment list sent for this revision.
*/

existing.attachments =
  attachments;

existing.status =
  "submitted";

existing.submittedAt =
  now;

existing.lastEditedAt =
  now;

existing.reviewedAt =
  null;

existing.returnedAt =
  null;

existing.returnedBy =
  null;

existing.returnedReason =
  "";

existing.gradedAt =
  null;

existing.lockedAt =
  null;

existing.locked =
  false;

existing.grade =
  null;

existing.feedback =
  null;

existing.revisionNumber =
  Math.max(
    1,
    Number(
      existing.revisionNumber ||
      1
    )
  ) + 1;

if (isResubmission) {
  existing.attemptNumber =
    Math.max(
      1,
      Number(
        existing.attemptNumber ||
        1
      )
    ) + 1;
}

existing.submissionHistory.push({
  revisionNumber:
    existing.revisionNumber,

  attemptNumber:
    existing.attemptNumber,

  text:
    text || null,

  fileUrl:
    primaryFileUrl,

  /*
    Save this revision's attachment snapshot rather than
    referring only to the current submission array.
  */

  attachments,

  status:
    "submitted",

  grade:
    null,

  feedback:
    null,

  changedBy:
    req.user._id,

  changedByRole:
    req.user.role,

  action:
    isResubmission
      ? "resubmitted"
      : "updated",

  createdAt:
    now
});

      await existing.save();

      submission =
        existing;

      socketEvent =
        isResubmission
          ? "submission:resubmitted"
          : "submission:updated";

      responseStatus =
        200;
    }

    const populated =
      await Submission.findById(
        submission._id
      )
        .populate(
          "assignmentId",
          "title dueDate classId"
        )
        .populate(
          "classId",
          "title subject classCode"
        )
        .populate(
          "studentId",
          "name email profileImage course"
        )
        .populate(
          "teacherId",
          "name email profileImage subject"
        )
        .populate(
          "returnedBy",
          "name email role profileImage"
        );

    const io =
      req.app.get("io");

    if (io) {
      io.to(
        String(
          assignment.schoolId
        )
      ).emit(
        socketEvent,
        populated
      );

      if (assignment.teacherId) {
        io.to(
          String(
            assignment.teacherId
          )
        ).emit(
          socketEvent,
          populated
        );
      }

      io.to(
        String(req.user._id)
      ).emit(
        socketEvent,
        populated
      );
    }

    const reviewerRecipients=[assignment.teacherId,assignment.schoolId].map(String).filter((id,index,array)=>id&&id!==String(req.user._id)&&array.indexOf(id)===index);
    await createManyNotifications(reviewerRecipients.map(user=>({user,sender:req.user._id,type:"submission",text:`${populated.studentId?.name||"A student"} submitted ${populated.assignmentId?.title||"an assignment"}`,link:`/teacher.html?section=submissions`,entityType:"submission",entityId:submission._id,metadata:{submissionId:String(submission._id),assignmentId:String(submission.assignmentId),classId:String(submission.classId||"")}})),{io});

    return res
      .status(responseStatus)
      .json(populated);

  } catch (err) {
    console.error(
      "POST /api/submissions error:",
      err
    );

    return res.status(500).json({
      message:
        "Failed to submit assignment"
    });
  }
});

/* ============================================
   GRADE / REVIEW SUBMISSION
============================================ */
router.patch("/:id/review", auth, async (req, res) => {
  try {
    const submission =
      await Submission.findById(
        req.params.id
      );

    if (!submission) {
      return res.status(404).json({
        message:
          "Submission not found"
      });
    }

    if (
      !await canGrade(
        req.user,
        submission
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to review this submission"
      });
    }

    const requestedStatus =
      String(
        req.body.status ||
        "reviewed"
      )
        .trim()
        .toLowerCase();

    const allowedStatuses = [
      "returned",
      "reviewed",
      "graded",
      "locked"
    ];

    if (
      !allowedStatuses.includes(
        requestedStatus
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid review status"
      });
    }

    const now =
      new Date();

    const feedback =
      req.body.feedback !==
        undefined
        ? String(
            req.body.feedback || ""
          ).trim()
        : submission.feedback;

    const grade =
      req.body.grade !==
        undefined
        ? String(
            req.body.grade || ""
          ).trim()
        : submission.grade;

    /* =====================================================
   RUBRIC CALCULATION
===================================================== */

const assignment =
  await Assignment.findById(
    submission.assignmentId
  ).lean();

const rubricScores =
  Array.isArray(
    req.body.rubricScores
  )
    ? req.body.rubricScores
    : [];

let totalPoints =
  Number(
    assignment?.totalPoints ||
    0
  );

let earnedPoints = 0;

const normalizedRubric =
  rubricScores.map(item => {

    const earned =
      Math.max(
        0,
        Number(
          item.earnedPoints || 0
        )
      );

    earnedPoints += earned;

    return {

      rubricId:
        item.rubricId || null,

      title:
        String(
          item.title || ""
        ),

      description:
        String(
          item.description || ""
        ),

      maxPoints:
        Number(
          item.maxPoints || 0
        ),

      earnedPoints:
        earned,

      feedback:
        String(
          item.feedback || ""
        ),

      order:
        Number(
          item.order || 0
        )

    };

  });

if(
  !totalPoints &&
  normalizedRubric.length
){

  totalPoints =
    normalizedRubric.reduce(
      (
        sum,
        criterion
      ) =>
        sum +
        criterion.maxPoints,
      0
    );

}

const percentage =
  totalPoints > 0
    ? Number(
        (
          earnedPoints /
          totalPoints
        ) * 100
      )
    : 0;

const passed =
  percentage >=
  Number(
    assignment?.passingScore ||
    60
  );

submission.feedback =
  feedback || null;

submission.grade =
  grade || null;

submission.rubricScores =
  normalizedRubric;

submission.totalPoints =
  totalPoints;

submission.earnedPoints =
  earnedPoints;

submission.percentage =
  percentage;

submission.passed =
  passed;

submission.gradedBy =
  req.user._id;

    submission.status =
      requestedStatus;

    submission.reviewedAt =
      now;

    submission.lastEditedAt =
      now;

    submission.returnedAt =
      requestedStatus ===
        "returned"
        ? now
        : null;

    submission.returnedBy =
      requestedStatus ===
        "returned"
        ? req.user._id
        : null;

    submission.returnedReason =
      requestedStatus ===
        "returned"
        ? (
            String(
              req.body.returnedReason ||
              feedback ||
              ""
            ).trim()
          )
        : "";

    submission.gradedAt =
      requestedStatus ===
        "graded"
        ? now
        : null;

    submission.locked =
      [
        "graded",
        "reviewed",
        "locked"
      ].includes(
        requestedStatus
      );

    submission.lockedAt =
      submission.locked
        ? now
        : null;

    submission.revisionNumber =
      Math.max(
        1,
        Number(
          submission.revisionNumber ||
          1
        )
      ) + 1;


submission.submissionHistory.push({
  revisionNumber:
    submission.revisionNumber,

  attemptNumber:
    Math.max(
      1,
      Number(
        submission.attemptNumber ||
        1
      )
    ),

  text:
    submission.text,

  fileUrl:
    submission.fileUrl,

  /*
    Preserve the exact files that were present when the
    teacher returned, reviewed, graded, or locked the work.

    Convert Mongoose subdocuments into plain objects before
    placing them inside the history snapshot.
  */

  attachments:
    Array.isArray(
      submission.attachments
    )
      ? submission.attachments.map(
          attachment => {
            if (
              attachment &&
              typeof attachment.toObject ===
                "function"
            ) {
              return attachment.toObject();
            }

            return attachment;
          }
        )
      : [],

  status:
    requestedStatus,

  grade:
    submission.grade,

  feedback:
    submission.feedback,
  rubricScores:
  normalizedRubric,

totalPoints,

earnedPoints,

percentage,

passed,

  changedBy:
    req.user._id,

  changedByRole:
    req.user.role,

  action:
    requestedStatus,

  createdAt:
    now
});

    await submission.save();

    const populated =
      await Submission.findById(
        submission._id
      )
        .populate(
          "assignmentId",
          "title dueDate classId"
        )
        .populate(
          "classId",
          "title subject classCode"
        )
        .populate(
          "studentId",
          "name email profileImage course"
        )
        .populate(
          "teacherId",
          "name email profileImage subject"
        )
        .populate(
          "returnedBy",
          "name email role profileImage"
        );

    const io =
      req.app.get("io");

    if (io) {
      const eventName =
        requestedStatus ===
          "returned"
          ? "submission:returned"
          : requestedStatus ===
              "graded"
            ? "submission:graded"
            : "submission:reviewed";

      io.to(
        String(
          submission.schoolId
        )
      ).emit(
        eventName,
        populated
      );

      io.to(
        String(
          submission.studentId
        )
      ).emit(
        eventName,
        populated
      );

      if (submission.teacherId) {
        io.to(
          String(
            submission.teacherId
          )
        ).emit(
          eventName,
          populated
        );
      }
    }

    await createNotification({user:submission.studentId,sender:req.user._id,type:"submission_reviewed",priority:"high",text:`Your submission for ${populated.assignmentId?.title||"an assignment"} was ${requestedStatus}`,link:`/student.html?section=assignments`,entityType:"submission",entityId:submission._id,metadata:{submissionId:String(submission._id),assignmentId:String(submission.assignmentId),status:requestedStatus,grade:submission.grade||null}},{io}).catch(error=>console.warn("SUBMISSION NOTIFICATION ERROR:",error.message));

    return res.json(
      populated
    );

  } catch (err) {
    console.error(
      "PATCH /api/submissions/:id/review error:",
      err
    );

    return res.status(500).json({
      message:
        "Failed to review submission"
    });
  }
});

/* ============================================
   DELETE SUBMISSION
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const isOwner = String(submission.studentId) === String(req.user._id);

     if (
      !isOwner &&
      !await canGrade(
        req.user,
        submission
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to delete submission"
      });
    }

    await submission.deleteOne();

    res.json({ message: "Submission deleted" });
  } catch (err) {
    console.error("DELETE /api/submissions/:id error:", err);
    res.status(500).json({ message: "Failed to delete submission" });
  }
});

module.exports = router;
