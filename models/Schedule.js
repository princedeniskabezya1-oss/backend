"use strict";

const mongoose =
  require("mongoose");


/* =========================================================
   SCHEDULE MODEL

   PURPOSE
   ---------------------------------------------------------

   One Schedule document represents one teaching session.

   SCHOOL / ADMIN
   - Creates and manages School teaching schedules.
   - Assigns classes and teachers.
   - Tracks completion, cancellation, missed sessions,
     attendance and teacher activity.

   TEACHER
   - Views sessions assigned through their classes.
   - Starts / joins sessions.
   - Records completion and teaching notes.
   - Cannot change ownership.

   STUDENT
   - Views sessions belonging to enrolled classes.
   - Uses the schedule for upcoming-class information.
   - Student attendance remains authoritative in Attendance.

   IMPORTANT
   ---------------------------------------------------------

   Existing legacy fields are intentionally retained:

     date
     time
     startTime
     endTime
     status

   This prevents existing School/Teacher frontend code from
   breaking while the platform migrates to richer tracking.
========================================================= */


/* =========================================================
   RESCHEDULE HISTORY
========================================================= */

const rescheduleHistorySchema =
  new mongoose.Schema(
    {

      previousDate:{
        type:
          Date,

        default:
          null
      },


      previousStartTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      previousEndTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      newDate:{
        type:
          Date,

        default:
          null
      },


      newStartTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      newEndTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      reason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          null
      },


      changedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      changedAt:{
        type:
          Date,

        default:
          Date.now
      }

    },
    {
      _id:
        false
    }
  );


/* =========================================================
   SCHEDULE SCHEMA
========================================================= */

const scheduleSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         OWNERSHIP
      ===================================================== */

      schoolId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },


      classId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Class",

        default:
          null,

        index:
          true
      },


      teacherId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true
      },


      /* =====================================================
         WHO CREATED THE SCHEDULE

         Useful for distinguishing:
           School-created
           Teacher-created
           Admin-created
      ===================================================== */

      createdBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true
      },


      createdByRole:{
        type:
          String,

        enum:[
          "admin",
          "school",
          "teacher",
          "system"
        ],

        default:
          null
      },


      /* =====================================================
         BASIC SESSION INFORMATION
      ===================================================== */

      title:{
        type:
          String,

        trim:
          true,

        maxlength:
          140,

        default:
          "Class Schedule"
      },


      notes:{
        type:
          String,

        trim:
          true,

        maxlength:
          3000,

        default:
          null
      },


      /* =====================================================
         SESSION TYPE
      ===================================================== */

      sessionType:{
        type:
          String,

        enum:[
          "online",
          "physical",
          "hybrid"
        ],

        default:
          "online",

        index:
          true
      },


      location:{
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          null
      },


      meetingLink:{
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          null
      },


      /* =====================================================
         LEGACY / FRONTEND-COMPATIBLE SCHEDULE TIME

         Keep these fields because existing School and Teacher
         pages already consume them.
      ===================================================== */

      date:{
        type:
          Date,

        default:
          null,

        index:
          true
      },


      time:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      startTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      endTime:{
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          null
      },


      /* =====================================================
         CANONICAL SCHEDULE DATETIMES

         These will eventually become authoritative for:
           reminders
           late detection
           missed-session detection
           analytics

         Existing date/startTime/endTime remain available
         during migration.
      ===================================================== */

      scheduledStartAt:{
        type:
          Date,

        default:
          null,

        index:
          true
      },


      scheduledEndAt:{
        type:
          Date,

        default:
          null,

        index:
          true
      },


      /* =====================================================
         SESSION LIFECYCLE

         "status" remains compatible with existing frontend.

         sessionStatus provides the richer operational state.
      ===================================================== */

      status:{
        type:
          String,

        enum:[
          "scheduled",
          "completed",
          "cancelled"
        ],

        default:
          "scheduled",

        index:
          true
      },


      sessionStatus:{
        type:
          String,

        enum:[
          "scheduled",
          "started",
          "completed",
          "missed",
          "cancelled",
          "rescheduled"
        ],

        default:
          "scheduled",

        index:
          true
      },


      /* =====================================================
         ACTUAL SESSION TRACKING
      ===================================================== */

      actualStartAt:{
        type:
          Date,

        default:
          null
      },


      actualEndAt:{
        type:
          Date,

        default:
          null
      },


      /* =====================================================
         TEACHER SESSION TRACKING
      ===================================================== */

      teacherJoinedAt:{
        type:
          Date,

        default:
          null
      },


      teacherLeftAt:{
        type:
          Date,

        default:
          null
      },


      teacherAttendanceStatus:{
        type:
          String,

        enum:[
          "pending",
          "present",
          "late",
          "missed",
          "excused"
        ],

        default:
          "pending",

        index:
          true
      },


      teacherLateMinutes:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      teacherSessionDurationMinutes:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      /* =====================================================
         SESSION COMPLETION
      ===================================================== */

      teacherMarkedCompleteAt:{
        type:
          Date,

        default:
          null
      },


      completionConfirmedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      completionConfirmedAt:{
        type:
          Date,

        default:
          null
      },


      completionNotes:{
        type:
          String,

        trim:
          true,

        maxlength:
          3000,

        default:
          null
      },


      /* =====================================================
         MISSED SESSION
      ===================================================== */

      missedAt:{
        type:
          Date,

        default:
          null
      },


      missedReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          null
      },


      missedDetectedAutomatically:{
        type:
          Boolean,

        default:
          false
      },


      /* =====================================================
         CANCELLATION
      ===================================================== */

      cancelledAt:{
        type:
          Date,

        default:
          null
      },


      cancelledBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      cancelReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          null
      },


      /* =====================================================
         RESCHEDULING
      ===================================================== */

      rescheduledAt:{
        type:
          Date,

        default:
          null
      },


      rescheduledBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      rescheduleReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          null
      },


      rescheduleCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      rescheduleHistory:{
        type:[
          rescheduleHistorySchema
        ],

        default:[]
      },


      /* =====================================================
         STUDENT SESSION SUMMARY

         IMPORTANT:

         Individual student attendance should remain in your
         Attendance collection.

         These are only cached aggregate values for dashboards.
      ===================================================== */

      expectedStudentCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      presentStudentCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      lateStudentCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      absentStudentCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      excusedStudentCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      attendanceFinalized:{
        type:
          Boolean,

        default:
          false
      },


      attendanceFinalizedAt:{
        type:
          Date,

        default:
          null
      },


      attendanceFinalizedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      /* =====================================================
         SCHOOL REVIEW / ACCOUNTABILITY
      ===================================================== */

      requiresReview:{
        type:
          Boolean,

        default:
          false,

        index:
          true
      },


      reviewReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          null
      },


      reviewedAt:{
        type:
          Date,

        default:
          null
      },


      reviewedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      /* =====================================================
         SYSTEM TRACKING

         Allows future scheduled jobs to determine whether
         missed-session evaluation has already occurred.
      ===================================================== */

      trackingEvaluatedAt:{
        type:
          Date,

        default:
          null
      },


      lastActivityAt:{
        type:
          Date,

        default:
          null
      }

    },
    {
      timestamps:
        true
    }
  );


/* =========================================================
   INDEXES
========================================================= */


/*
  Existing query compatibility.
*/

scheduleSchema.index({
  schoolId:
    1,

  date:
    1
});


scheduleSchema.index({
  teacherId:
    1,

  date:
    1
});


scheduleSchema.index({
  classId:
    1,

  date:
    1
});


/*
  School operations dashboard.
*/

scheduleSchema.index({

  schoolId:
    1,

  sessionStatus:
    1,

  scheduledStartAt:
    1

});


/*
  Teacher schedule timeline.
*/

scheduleSchema.index({

  teacherId:
    1,

  sessionStatus:
    1,

  scheduledStartAt:
    1

});


/*
  Class / Student schedule timeline.
*/

scheduleSchema.index({

  classId:
    1,

  sessionStatus:
    1,

  scheduledStartAt:
    1

});


/*
  Missed / late Teacher monitoring.
*/

scheduleSchema.index({

  schoolId:
    1,

  teacherAttendanceStatus:
    1,

  scheduledStartAt:
    -1

});


/*
  School review queue.
*/

scheduleSchema.index({

  schoolId:
    1,

  requiresReview:
    1,

  scheduledStartAt:
    -1

});


/*
  System evaluation of scheduled sessions.
*/

scheduleSchema.index({

  sessionStatus:
    1,

  scheduledEndAt:
    1,

  trackingEvaluatedAt:
    1

});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "Schedule",
    scheduleSchema
  );
