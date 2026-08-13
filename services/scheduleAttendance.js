"use strict";

const mongoose =
  require("mongoose");

const Attendance =
  require("../models/Attendance");

const Schedule =
  require("../models/Schedule");

const Class =
  require("../models/Class");


/* =========================================================
   SCHEDULE ATTENDANCE SERVICE

   RESPONSIBILITIES
   ---------------------------------------------------------

   1. Initialize pending Attendance records when a scheduled
      teaching session starts.

   2. Never create Attendance for users outside Class.studentIds.

   3. Finalize unmarked pending Attendance as absent when a
      teaching session is completed.

   4. Recalculate Schedule attendance summary counters.

   5. Keep:
        Schedule
        Attendance
        Class
      ownership synchronized from authoritative backend data.

   6. Support multiple scheduled sessions in the same class
      on the same calendar day.

   IMPORTANT
   ---------------------------------------------------------

   Attendance uniqueness for scheduled sessions is:

     schoolId
     classId
     studentId
     scheduleId

   Date alone is NOT sufficient for scheduled attendance.
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const ATTENDANCE_STATUSES =
  new Set([
    "pending",
    "present",
    "late",
    "absent",
    "excused"
  ]);


const SESSION_TYPES =
  new Set([
    "online",
    "physical",
    "hybrid"
  ]);


/* =========================================================
   ID NORMALIZATION
========================================================= */

function normalizeId(
  value
){

  if(
    value === null ||
    value === undefined
  ){

    return "";

  }


  if(
    typeof value ===
    "string"
  ){

    return value.trim();

  }


  if(
    value instanceof
      mongoose.Types.ObjectId
  ){

    return value
      .toHexString();

  }


  if(
    typeof value ===
      "object" &&
    typeof value.toHexString ===
      "function"
  ){

    try{

      return String(
        value.toHexString()
      ).trim();

    }catch(
      error
    ){

      return "";

    }

  }


  if(
    typeof value ===
      "object" &&
    value._id !==
      undefined &&
    value._id !==
      value
  ){

    return normalizeId(
      value._id
    );

  }


  try{

    const normalized =
      String(
        value
      ).trim();


    return normalized ===
      "[object Object]"
      ? ""
      : normalized;

  }catch(
    error
  ){

    return "";

  }

}


/* =========================================================
   NORMALIZE ATTENDANCE DAY

   Attendance.date remains a day-level reporting field even
   when scheduleId gives the precise session identity.
========================================================= */

function normalizeAttendanceDate(
  value
){

  const date =
    value
      ? new Date(
          value
        )
      : new Date();


  if(
    Number.isNaN(
      date.getTime()
    )
  ){

    return null;

  }


  date.setHours(
    0,
    0,
    0,
    0
  );


  return date;

}


/* =========================================================
   SESSION TYPE
========================================================= */

function normalizeSessionType(
  value
){

  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  return SESSION_TYPES.has(
    normalized
  )
    ? normalized
    : "online";

}


/* =========================================================
   LOAD SCHEDULE CONTEXT
========================================================= */

async function loadScheduleContext(
  scheduleOrId
){

  const schedule =
    typeof scheduleOrId ===
      "object" &&
    scheduleOrId?._id
      ? scheduleOrId
      : await Schedule.findById(
          scheduleOrId
        );


  if(
    !schedule
  ){

    const error =
      new Error(
        "Schedule not found."
      );


    error.statusCode =
      404;


    throw error;

  }


  const classDoc =
    await Class.findById(
      schedule.classId
    );


  if(
    !classDoc
  ){

    const error =
      new Error(
        "Class linked to this schedule was not found."
      );


    error.statusCode =
      404;


    throw error;

  }


  if(
    normalizeId(
      schedule.schoolId
    ) !==
    normalizeId(
      classDoc.schoolId
    )
  ){

    const error =
      new Error(
        "Schedule School ownership does not match the class."
      );


    error.statusCode =
      409;


    throw error;

  }


  const classTeacherId =
    normalizeId(
      classDoc.teacherId
    );


  const scheduleTeacherId =
    normalizeId(
      schedule.teacherId
    );


  if(
    classTeacherId &&
    scheduleTeacherId &&
    classTeacherId !==
      scheduleTeacherId
  ){

    const error =
      new Error(
        "Schedule Teacher assignment does not match the class."
      );


    error.statusCode =
      409;


    throw error;

  }


  return {
    schedule,
    classDoc
  };

}


/* =========================================================
   GET ENROLLED STUDENT IDS
========================================================= */

function getClassStudentIds(
  classDoc
){

  if(
    !classDoc
  ){

    return [];

  }


  return [
    ...new Set(
      (
        Array.isArray(
          classDoc.studentIds
        )
          ? classDoc.studentIds
          : []
      )
        .map(
          normalizeId
        )
        .filter(
          id =>
            Boolean(
              id &&
              mongoose.Types.ObjectId
                .isValid(
                  id
                )
            )
        )
    )
  ];

}


/* =========================================================
   INITIALIZE SCHEDULE ATTENDANCE

   Called when Teacher starts session.

   Every currently enrolled student receives:
     status: pending

   No student is falsely marked present.
========================================================= */

async function initializeScheduleAttendance(
  scheduleOrId,
  {
    markedBy = null,
    source = "schedule"
  } = {}
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  const schoolId =
    normalizeId(
      classDoc.schoolId
    );


  const classId =
    normalizeId(
      classDoc._id
    );


  const teacherId =
    normalizeId(
      schedule.teacherId ||
      classDoc.teacherId
    );


  if(
    !teacherId
  ){

    const error =
      new Error(
        "The class does not have an assigned Teacher."
      );


    error.statusCode =
      409;


    throw error;

  }


  const studentIds =
    getClassStudentIds(
      classDoc
    );


  const attendanceDate =
    normalizeAttendanceDate(
      schedule.date ||
      schedule.scheduledStartAt
    );


  if(
    !attendanceDate
  ){

    const error =
      new Error(
        "The schedule does not contain a valid attendance date."
      );


    error.statusCode =
      400;


    throw error;

  }


  const markerId =
    normalizeId(
      markedBy ||
      teacherId
    );


  if(
    !markerId
  ){

    const error =
      new Error(
        "Attendance markedBy could not be determined."
      );


    error.statusCode =
      400;


    throw error;

  }


  /* =====================================================
     NO STUDENTS

     Still synchronize Schedule summary.
  ===================================================== */

  if(
    !studentIds.length
  ){

    schedule.expectedStudentCount =
      0;

    schedule.presentStudentCount =
      0;

    schedule.lateStudentCount =
      0;

    schedule.absentStudentCount =
      0;

    schedule.excusedStudentCount =
      0;

    schedule.attendanceFinalized =
      false;

    await schedule.save();


    return {
      created:
        0,

      existing:
        0,

      total:
        0,

      records:
        []
    };

  }


  const now =
    new Date();


  /* =====================================================
     BULK UPSERT

     Filter uses scheduleId.

     This is what allows:
       9 AM class
       1 PM class
       4 PM class

     on the same date.
  ===================================================== */

  const operations =
    studentIds.map(
      studentId => ({
        updateOne:{

          filter:{

            schoolId,

            classId,

            studentId,

            scheduleId

          },

          update:{

            $setOnInsert:{

              schoolId,

              classId,

              teacherId,

              studentId,

              scheduleId,

              date:
                attendanceDate,

              status:
                "pending",

              markedBy:
                markerId,

              markedAt:
                now,

              source:
                source ===
                  "system"
                  ? "system"
                  : "schedule",

              sessionType:
                normalizeSessionType(
                  schedule.sessionType
                ),

              meetingJoined:
                false,

              participationScore:
                0,

              participationNotes:
                "",

              notes:
                "",

              engagementLevel:
                "medium",

              requiresFollowUp:
                false,

              attendanceFinalized:
                false,

              autoMarked:
                false,

              lastActivityAt:
                now

            },

            /*
              Keep authoritative ownership synchronized without
              overwriting Teacher-marked status.
            */

            $set:{

              schoolId,

              classId,

              teacherId,

              scheduleId,

              sessionType:
                normalizeSessionType(
                  schedule.sessionType
                ),

              lastActivityAt:
                now

            }

          },

          upsert:
            true

        }
      })
    );


  await Attendance.bulkWrite(
    operations,
    {
      ordered:
        false
    }
  );


  const records =
    await Attendance.find({

      schoolId,

      classId,

      scheduleId

    })
      .sort({
        createdAt:
          1
      });


  schedule.expectedStudentCount =
    studentIds.length;


  await schedule.save();


  await synchronizeScheduleAttendanceSummary(
    schedule
  );


  return {

    total:
      records.length,

    expected:
      studentIds.length,

    records

  };

}


/* =========================================================
   ATTENDANCE SUMMARY
========================================================= */

async function calculateScheduleAttendanceSummary(
  scheduleOrId
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  const schoolId =
    normalizeId(
      classDoc.schoolId
    );


  const classId =
    normalizeId(
      classDoc._id
    );


  const records =
    await Attendance.find({

      schoolId,

      classId,

      scheduleId

    })
      .select(
        "status attendanceFinalized"
      )
      .lean();


  const summary = {

    total:
      records.length,

    pending:
      0,

    present:
      0,

    late:
      0,

    absent:
      0,

    excused:
      0

  };


  records.forEach(
    record => {

      const status =
        ATTENDANCE_STATUSES.has(
          record.status
        )
          ? record.status
          : "pending";


      summary[
        status
      ] +=
        1;

    }
  );


  return summary;

}


/* =========================================================
   SYNCHRONIZE SCHEDULE SUMMARY
========================================================= */

async function synchronizeScheduleAttendanceSummary(
  scheduleOrId
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const summary =
    await calculateScheduleAttendanceSummary(
      schedule
    );


  /*
    Expected students come from the real class roster.

    This avoids treating missing Attendance rows as a smaller
    class.
  */

  const expectedStudentCount =
    getClassStudentIds(
      classDoc
    ).length;


  schedule.expectedStudentCount =
    expectedStudentCount;


  schedule.presentStudentCount =
    summary.present;


  schedule.lateStudentCount =
    summary.late;


  schedule.absentStudentCount =
    summary.absent;


  schedule.excusedStudentCount =
    summary.excused;


  schedule.lastActivityAt =
    new Date();


  await schedule.save();


  return {
    ...summary,
    expectedStudentCount
  };

}


/* =========================================================
   FINALIZE SCHEDULE ATTENDANCE

   Called when session is completed.

   Any still-pending student becomes ABSENT.

   Existing:
     present
     late
     excused
     absent

   records are preserved.
========================================================= */

async function finalizeScheduleAttendance(
  scheduleOrId,
  {
    finalizedBy = null
  } = {}
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  /*
    Ensure every currently enrolled student has a row first.
  */

  await initializeScheduleAttendance(
    schedule,
    {
      markedBy:
        finalizedBy ||
        schedule.teacherId,

      source:
        "schedule"
    }
  );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  const schoolId =
    normalizeId(
      classDoc.schoolId
    );


  const classId =
    normalizeId(
      classDoc._id
    );


  const markerId =
    normalizeId(
      finalizedBy ||
      schedule.teacherId
    );


  const now =
    new Date();


  /* =====================================================
     PENDING -> ABSENT
  ===================================================== */

  await Attendance.updateMany(
    {

      schoolId,

      classId,

      scheduleId,

      status:
        "pending"

    },
    {

      $set:{

        status:
          "absent",

        markedBy:
          markerId,

        markedAt:
          now,

        source:
          "system",

        autoMarked:
          true,

        autoMarkedReason:
          "Student remained unmarked when the scheduled teaching session was finalized.",

        attendanceFinalized:
          true,

        finalizedAt:
          now,

        finalizedBy:
          markerId,

        lastActivityAt:
          now

      }

    }
  );


  /* =====================================================
     FINALIZE ALREADY MARKED RECORDS
  ===================================================== */

  await Attendance.updateMany(
    {

      schoolId,

      classId,

      scheduleId,

      status:{
        $in:[
          "present",
          "late",
          "absent",
          "excused"
        ]
      }

    },
    {

      $set:{

        attendanceFinalized:
          true,

        finalizedAt:
          now,

        finalizedBy:
          markerId,

        lastActivityAt:
          now

      }

    }
  );


  schedule.attendanceFinalized =
    true;


  schedule.attendanceFinalizedAt =
    now;


  schedule.attendanceFinalizedBy =
    markerId;


  await schedule.save();


  const summary =
    await synchronizeScheduleAttendanceSummary(
      schedule
    );


  return {
    finalized:
      true,

    summary
  };

}


/* =========================================================
   REOPEN ATTENDANCE

   School/Admin can later use this if a finalized session must
   be corrected.

   This does NOT reset statuses.
========================================================= */

async function reopenScheduleAttendance(
  scheduleOrId
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  await Attendance.updateMany(
    {
      scheduleId
    },
    {
      $set:{
        attendanceFinalized:
          false,

        finalizedAt:
          null,

        finalizedBy:
          null,

        lastActivityAt:
          new Date()
      }
    }
  );


  schedule.attendanceFinalized =
    false;


  schedule.attendanceFinalizedAt =
    null;


  schedule.attendanceFinalizedBy =
    null;


  schedule.lastActivityAt =
    new Date();


  await schedule.save();


  return synchronizeScheduleAttendanceSummary(
    schedule
  );

}


/* =========================================================
   RESET UNSTARTED RESCHEDULE ATTENDANCE

   If a future session was initialized but then rescheduled
   before any student activity occurred, its pending rows can
   safely follow the updated Schedule date.

   Actual attendance activity is never silently destroyed.
========================================================= */

async function synchronizeRescheduledAttendance(
  scheduleOrId
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  const records =
    await Attendance.find({
      scheduleId
    });


  if(
    !records.length
  ){

    return {
      updated:
        0
    };

  }


  const hasRecordedActivity =
    records.some(
      record => {

        return (
          record.status !==
            "pending" ||
          record.meetingJoined ||
          record.joinTime ||
          record.leaveTime ||
          Number(
            record.participationScore ||
            0
          ) >
            0
        );

      }
    );


  if(
    hasRecordedActivity
  ){

    const error =
      new Error(
        "Attendance activity already exists for this session and cannot be silently moved to another schedule time."
      );


    error.statusCode =
      409;


    throw error;

  }


  const newDate =
    normalizeAttendanceDate(
      schedule.date ||
      schedule.scheduledStartAt
    );


  await Attendance.updateMany(
    {
      scheduleId
    },
    {
      $set:{

        date:
          newDate,

        teacherId:
          schedule.teacherId ||
          classDoc.teacherId,

        sessionType:
          normalizeSessionType(
            schedule.sessionType
          ),

        lastActivityAt:
          new Date()

      }
    }
  );


  return {
    updated:
      records.length
  };

}


/* =========================================================
   CANCEL SCHEDULE ATTENDANCE

   We do NOT mark students absent when School/Teacher cancels
   a class.

   Pending records are removed because no class took place.

   Existing real attendance activity is preserved for audit.
========================================================= */

async function handleCancelledScheduleAttendance(
  scheduleOrId
){

  const {
    schedule
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  const scheduleId =
    normalizeId(
      schedule._id
    );


  const result =
    await Attendance.deleteMany({

      scheduleId,

      status:
        "pending",

      meetingJoined:
        false,

      joinTime:
        null

    });


  await synchronizeScheduleAttendanceSummary(
    schedule
  );


  return {
    removedPending:
      Number(
        result.deletedCount ||
        0
      )
  };

}


/* =========================================================
   GET SCHEDULE ATTENDANCE
========================================================= */

async function getScheduleAttendance(
  scheduleOrId
){

  const {
    schedule,
    classDoc
  } =
    await loadScheduleContext(
      scheduleOrId
    );


  return Attendance.find({
    schoolId:
      classDoc.schoolId,

    classId:
      classDoc._id,

    scheduleId:
      schedule._id
  })
    .populate(
      "studentId",
      "name email profileImage avatar course role"
    )
    .populate(
      "markedBy",
      "name email role"
    )
    .populate(
      "finalizedBy",
      "name email role"
    )
    .sort({
      createdAt:
        1
    });

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  initializeScheduleAttendance,

  finalizeScheduleAttendance,

  reopenScheduleAttendance,

  synchronizeScheduleAttendanceSummary,

  calculateScheduleAttendanceSummary,

  synchronizeRescheduledAttendance,

  handleCancelledScheduleAttendance,

  getScheduleAttendance

};
