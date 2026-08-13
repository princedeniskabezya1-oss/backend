"use strict";

const Schedule =
  require("../models/Schedule");


/* =========================================================
   SCHEDULE TRACKING SERVICE

   PURPOSE
   ---------------------------------------------------------

   Automatically evaluates teaching sessions that should
   already have started or ended.

   Detects:

     - Teacher missed session
     - Teacher late start
     - Sessions requiring School review

   IMPORTANT
   ---------------------------------------------------------

   This service NEVER marks students absent.

   Student attendance is controlled by:
     services/scheduleAttendance.js

   A Teacher missing a class must never become a Student
   absence.
========================================================= */


/* =========================================================
   CONFIGURATION

   START GRACE:
   Teacher may start within this many minutes without being
   considered late.

   MISSED GRACE:
   If Teacher never starts, wait this many minutes after the
   scheduled end before declaring the session missed.
========================================================= */

const TEACHER_START_GRACE_MINUTES =
  10;


const MISSED_SESSION_GRACE_MINUTES =
  15;


/* =========================================================
   DATE HELPERS
========================================================= */

function validDate(
  value
){

  if(
    !value
  ){

    return null;

  }


  const date =
    new Date(
      value
    );


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;

}


function addMinutes(
  date,
  minutes
){

  return new Date(
    date.getTime() +
    (
      Number(
        minutes ||
        0
      ) *
      60 *
      1000
    )
  );

}


function differenceMinutes(
  later,
  earlier
){

  if(
    !later ||
    !earlier
  ){

    return 0;

  }


  return Math.max(
    0,
    Math.floor(
      (
        later.getTime() -
        earlier.getTime()
      ) /
      60000
    )
  );

}


/* =========================================================
   TERMINAL STATES

   These sessions should not be automatically changed.
========================================================= */

function isTerminalSession(
  schedule
){

  return [
    "completed",
    "missed",
    "cancelled"
  ].includes(
    String(
      schedule?.sessionStatus ||
      ""
    )
  );

}


/* =========================================================
   DETERMINE WHETHER SESSION IS MISSED
========================================================= */

function shouldMarkSessionMissed(
  schedule,
  now = new Date()
){

  if(
    !schedule ||
    isTerminalSession(
      schedule
    )
  ){

    return false;

  }


  /*
    If the Teacher actually started the session,
    it was not missed.
  */

  if(
    schedule.actualStartAt ||
    schedule.teacherJoinedAt
  ){

    return false;

  }


  const scheduledEnd =
    validDate(
      schedule.scheduledEndAt
    );


  if(
    !scheduledEnd
  ){

    return false;

  }


  const missedCutoff =
    addMinutes(
      scheduledEnd,
      MISSED_SESSION_GRACE_MINUTES
    );


  return (
    now.getTime() >=
    missedCutoff.getTime()
  );

}


/* =========================================================
   DETERMINE TEACHER LATE START
========================================================= */

function calculateTeacherLateMinutes(
  schedule
){

  const scheduledStart =
    validDate(
      schedule?.scheduledStartAt
    );


  const actualStart =
    validDate(
      schedule?.teacherJoinedAt ||
      schedule?.actualStartAt
    );


  if(
    !scheduledStart ||
    !actualStart
  ){

    return 0;

  }


  const graceEnd =
    addMinutes(
      scheduledStart,
      TEACHER_START_GRACE_MINUTES
    );


  if(
    actualStart <=
    graceEnd
  ){

    return 0;

  }


  return differenceMinutes(
    actualStart,
    scheduledStart
  );

}


/* =========================================================
   MARK ONE SESSION MISSED
========================================================= */

async function markScheduleMissed(
  schedule,
  {
    now = new Date(),
    reason = null,
    automatic = true
  } = {}
){

  if(
    !schedule
  ){

    return null;

  }


  /*
    Re-check state because another request may have started
    or completed the session while the tracker was running.
  */

  const current =
    await Schedule.findById(
      schedule._id ||
      schedule
    );


  if(
    !current
  ){

    return null;

  }


  if(
    isTerminalSession(
      current
    )
  ){

    return current;

  }


  if(
    current.actualStartAt ||
    current.teacherJoinedAt
  ){

    return current;

  }


  current.sessionStatus =
    "missed";


  /*
    Keep legacy status compatible.

    The legacy status enum does not contain "missed", so it
    remains "scheduled".

    sessionStatus is the authoritative operational state.
  */

  current.status =
    "scheduled";


  current.teacherAttendanceStatus =
    "missed";


  current.missedAt =
    now;


  current.missedReason =
    reason ||
    "Teacher did not start the scheduled class session within the allowed attendance window.";


  current.missedDetectedAutomatically =
    Boolean(
      automatic
    );


  /*
    Send this session to the School review queue.
  */

  current.requiresReview =
    true;


  current.reviewReason =
    current.reviewReason ||
    "Scheduled teaching session was not started by the assigned Teacher.";


  current.trackingEvaluatedAt =
    now;


  current.lastActivityAt =
    now;


  await current.save();


  return current;

}


/* =========================================================
   EVALUATE ONE SCHEDULE

   Can be called:
     - after Schedule GET
     - by background job
     - by admin maintenance endpoint
========================================================= */

async function evaluateSchedule(
  scheduleOrId,
  {
    now = new Date()
  } = {}
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

    return {
      changed:
        false,

      reason:
        "not_found",

      schedule:
        null
    };

  }


  if(
    isTerminalSession(
      schedule
    )
  ){

    return {
      changed:
        false,

      reason:
        "terminal",

      schedule
    };

  }


  /* =====================================================
     TEACHER STARTED

     Determine whether Teacher was late.
  ===================================================== */

  if(
    schedule.actualStartAt ||
    schedule.teacherJoinedAt
  ){

    const lateMinutes =
      calculateTeacherLateMinutes(
        schedule
      );


    schedule.teacherLateMinutes =
      lateMinutes;


    schedule.teacherAttendanceStatus =
      lateMinutes >
      TEACHER_START_GRACE_MINUTES
        ? "late"
        : "present";


    schedule.trackingEvaluatedAt =
      now;


    schedule.lastActivityAt =
      now;


    await schedule.save();


    return {
      changed:
        true,

      reason:
        lateMinutes > 0
          ? "teacher_late"
          : "teacher_present",

      schedule
    };

  }


  /* =====================================================
     MISSED SESSION
  ===================================================== */

  if(
    shouldMarkSessionMissed(
      schedule,
      now
    )
  ){

    const updated =
      await markScheduleMissed(
        schedule,
        {
          now,
          automatic:
            true
        }
      );


    return {
      changed:
        true,

      reason:
        "missed",

      schedule:
        updated
    };

  }


  /*
    Evaluated, but the session has not reached a condition
    requiring a state change.
  */

  schedule.trackingEvaluatedAt =
    now;


  await schedule.save();


  return {
    changed:
      false,

    reason:
      "not_due",

    schedule
  };

}


/* =========================================================
   FIND SESSIONS THAT NEED AUTOMATIC EVALUATION
========================================================= */

async function findSchedulesForEvaluation(
  {
    now = new Date(),
    limit = 250
  } = {}
){

  const cutoff =
    new Date(
      now.getTime() -
      (
        MISSED_SESSION_GRACE_MINUTES *
        60 *
        1000
      )
    );


  return Schedule.find({

    sessionStatus:{
      $in:[
        "scheduled",
        "rescheduled"
      ]
    },

    scheduledEndAt:{
      $ne:
        null,

      $lte:
        cutoff
    },

    actualStartAt:
      null,

    teacherJoinedAt:
      null

  })
    .sort({
      scheduledEndAt:
        1
    })
    .limit(
      Math.max(
        1,
        Math.min(
          1000,
          Number(
            limit ||
            250
          )
        )
      )
    );

}


/* =========================================================
   PROCESS MISSED SESSIONS

   Designed to be safe if executed repeatedly.

   Already-completed/cancelled/missed sessions are ignored.
========================================================= */

async function processMissedSchedules(
  {
    now = new Date(),
    limit = 250
  } = {}
){

  const candidates =
    await findSchedulesForEvaluation({
      now,
      limit
    });


  const result = {

    checked:
      candidates.length,

    missed:
      0,

    skipped:
      0,

    errors:
      0,

    scheduleIds:
      []

  };


  for(
    const schedule of
    candidates
  ){

    try{

      if(
        !shouldMarkSessionMissed(
          schedule,
          now
        )
      ){

        result.skipped +=
          1;

        continue;

      }


      const updated =
        await markScheduleMissed(
          schedule,
          {
            now,
            automatic:
              true
          }
        );


      if(
        updated?.sessionStatus ===
        "missed"
      ){

        result.missed +=
          1;

        result.scheduleIds.push(
          String(
            updated._id
          )
        );

      }else{

        result.skipped +=
          1;

      }

    }catch(
      error
    ){

      result.errors +=
        1;


      console.error(
        "Automatic schedule tracking failed:",
        {
          scheduleId:
            String(
              schedule?._id ||
              ""
            ),

          message:
            error?.message ||
            error
        }
      );

    }

  }


  return result;

}


/* =========================================================
   SCHOOL REVIEW QUERY

   Used later by the School dashboard.
========================================================= */

async function getSchoolReviewQueue(
  schoolId,
  {
    limit = 100
  } = {}
){

  return Schedule.find({

    schoolId,

    requiresReview:
      true,

    reviewedAt:
      null

  })
    .populate(
      "teacherId",
      "name email profileImage"
    )
    .populate(
      "classId",
      "title subject classCode"
    )
    .sort({
      scheduledStartAt:
        -1
    })
    .limit(
      Math.max(
        1,
        Math.min(
          500,
          Number(
            limit ||
            100
          )
        )
      )
    );

}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  TEACHER_START_GRACE_MINUTES,

  MISSED_SESSION_GRACE_MINUTES,

  calculateTeacherLateMinutes,

  shouldMarkSessionMissed,

  markScheduleMissed,

  evaluateSchedule,

  findSchedulesForEvaluation,

  processMissedSchedules,

  getSchoolReviewQueue

};
