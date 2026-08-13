"use strict";

const mongoose =
  require("mongoose");


/* =========================================================
   ATTENDANCE MODEL
   PRODUCTION VERSION

   PURPOSE
   ---------------------------------------------------------

   Attendance represents ONE STUDENT'S participation in:

     - a scheduled teaching session
     - or a manual/non-scheduled class attendance date

   RELATIONSHIP
   ---------------------------------------------------------

   Schedule
     = what class session was supposed to happen

   Attendance
     = what happened to each individual student

   IMPORTANT
   ---------------------------------------------------------

   Scheduled attendance:
     uniqueness is based on scheduleId + studentId.

   Manual attendance:
     uniqueness is based on class + student + date.

   This allows multiple teaching sessions for the same class
   on the same calendar day.
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const ATTENDANCE_STATUSES = [
  "pending",
  "present",
  "late",
  "absent",
  "excused"
];


const ATTENDANCE_SOURCES = [
  "manual",
  "bulk",
  "schedule",
  "system"
];


const SESSION_TYPES = [
  "online",
  "physical",
  "hybrid"
];


const ENGAGEMENT_LEVELS = [
  "low",
  "medium",
  "high"
];


/* =========================================================
   SCHEMA
========================================================= */

const AttendanceSchema =
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

        required:
          true,

        index:
          true
      },


      teacherId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },


      studentId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },


      /* =====================================================
         OPTIONAL SCHEDULE RELATIONSHIP

         When present:
           one attendance record per student per schedule.

         When null:
           manual attendance follows the class/date identity.
      ===================================================== */

      scheduleId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Schedule",

        default:
          null,

        index:
          true
      },


      /* =====================================================
         ATTENDANCE DATE

         Keep normalized to the local attendance day in the
         route/service layer.

         Required even when scheduleId exists because:
           - legacy frontend depends on it
           - reporting depends on it
           - historical grouping becomes much easier
      ===================================================== */

      date:{
        type:
          Date,

        required:
          true,

        index:
          true
      },


      /* =====================================================
         STATUS
      ===================================================== */

      status:{
        type:
          String,

        enum:
          ATTENDANCE_STATUSES,

        default:
  "pending",

        required:
          true,

        index:
          true
      },


      /* =====================================================
         HOW ATTENDANCE WAS CREATED
      ===================================================== */

      source:{
        type:
          String,

        enum:
          ATTENDANCE_SOURCES,

        default:
          "manual",

        index:
          true
      },


      /* =====================================================
         WHO MARKED / LAST MODIFIED ATTENDANCE
      ===================================================== */

      markedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },


      markedAt:{
        type:
          Date,

        default:
          Date.now
      },


      /* =====================================================
         SESSION TYPE
      ===================================================== */

      sessionType:{
        type:
          String,

        enum:
          SESSION_TYPES,

        default:
          "online",

        index:
          true
      },


      /* =====================================================
         MEETING / SESSION PARTICIPATION
      ===================================================== */

      meetingJoined:{
        type:
          Boolean,

        default:
          false,

        index:
          true
      },


      joinTime:{
        type:
          Date,

        default:
          null
      },


      leaveTime:{
        type:
          Date,

        default:
          null
      },


      durationMinutes:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      /* =====================================================
         LATE TRACKING
      ===================================================== */

      lateMinutes:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      isLateExcused:{
        type:
          Boolean,

        default:
          false
      },


      lateReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          ""
      },


      /* =====================================================
         ABSENCE / EXCUSE
      ===================================================== */

      absenceReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          ""
      },


      excusedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      excusedAt:{
        type:
          Date,

        default:
          null
      },


      /* =====================================================
         PARTICIPATION
      ===================================================== */

      participationScore:{
        type:
          Number,

        min:
          0,

        max:
          100,

        default:
          0
      },


      participationNotes:{
        type:
          String,

        trim:
          true,

        default:
          "",

        maxlength:
          1000
      },


      /* =====================================================
         GENERAL NOTES
      ===================================================== */

      notes:{
        type:
          String,

        trim:
          true,

        default:
          "",

        maxlength:
          2000
      },


      /* =====================================================
         ENGAGEMENT / FOLLOW-UP
      ===================================================== */

      engagementLevel:{
        type:
          String,

        enum:
          ENGAGEMENT_LEVELS,

        default:
          "medium",

        index:
          true
      },


      requiresFollowUp:{
        type:
          Boolean,

        default:
          false,

        index:
          true
      },


      followUpReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1500,

        default:
          ""
      },


      followUpResolved:{
        type:
          Boolean,

        default:
          false
      },


      followUpResolvedAt:{
        type:
          Date,

        default:
          null
      },


      followUpResolvedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      /* =====================================================
         AUTOMATIC / SYSTEM TRACKING
      ===================================================== */

      autoMarked:{
        type:
          Boolean,

        default:
          false
      },


      autoMarkedReason:{
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          ""
      },


      attendanceFinalized:{
        type:
          Boolean,

        default:
          false,

        index:
          true
      },


      finalizedAt:{
        type:
          Date,

        default:
          null
      },


      finalizedBy:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      /* =====================================================
         DEVICE / TECHNICAL CONTEXT
      ===================================================== */

      deviceType:{
        type:
          String,

        default:
          "",

        trim:
          true,

        maxlength:
          200
      },


      ipAddress:{
        type:
          String,

        default:
          "",

        trim:
          true,

        maxlength:
          100
      },


      userAgent:{
        type:
          String,

        default:
          "",

        trim:
          true,

        maxlength:
          1000
      },


      /* =====================================================
         OPTIONAL LOCATION

         Useful later for physical/hybrid check-in without
         forcing geolocation into the current UI.
      ===================================================== */

      location:{
        type:
          String,

        trim:
          true,

        default:
          "",

        maxlength:
          500
      },


      /* =====================================================
         AUDIT / SYSTEM METADATA
      ===================================================== */

      metadata:{
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {}
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
        true,

      minimize:
        false
    }
  );


/* =========================================================
   UNIQUE IDENTITY — SCHEDULED ATTENDANCE

   One student can only have one Attendance record for one
   particular Schedule.

   This allows multiple sessions for the same class on the
   same calendar day.
========================================================= */

AttendanceSchema.index(
  {

    schoolId:
      1,

    classId:
      1,

    studentId:
      1,

    scheduleId:
      1

  },
  {

    unique:
      true,

    name:
      "uniq_attendance_schedule_student",

    partialFilterExpression:{

      scheduleId:{
        $type:
          "objectId"
      }

    }

  }
);


/* =========================================================
   UNIQUE IDENTITY — MANUAL ATTENDANCE

   When there is no Schedule:
     one record per student/class/date.

   This preserves your current manual/bulk workflow.
========================================================= */

AttendanceSchema.index(
  {

    schoolId:
      1,

    classId:
      1,

    studentId:
      1,

    date:
      1

  },
  {

    unique:
      true,

    name:
      "uniq_attendance_manual_student_day",

    partialFilterExpression:{

      scheduleId:
        null

    }

  }
);


/* =========================================================
   SCHEDULE LOOKUP
========================================================= */

AttendanceSchema.index({

  scheduleId:
    1,

  studentId:
    1

});


/* =========================================================
   SCHEDULE ANALYTICS
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  scheduleId:
    1,

  status:
    1

});


/* =========================================================
   TEACHER ANALYTICS
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  teacherId:
    1,

  date:
    -1

});


/* =========================================================
   STUDENT ANALYTICS
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  studentId:
    1,

  date:
    -1

});


/* =========================================================
   CLASS ANALYTICS
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  classId:
    1,

  date:
    -1

});


/* =========================================================
   STATUS FILTERING
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  status:
    1,

  date:
    -1

});


/* =========================================================
   FOLLOW-UP QUEUE
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  requiresFollowUp:
    1,

  followUpResolved:
    1,

  date:
    -1

});


/* =========================================================
   ENGAGEMENT ANALYTICS
========================================================= */

AttendanceSchema.index({

  schoolId:
    1,

  engagementLevel:
    1,

  date:
    -1

});


/* =========================================================
   SESSION PARTICIPATION
========================================================= */

AttendanceSchema.index({

  scheduleId:
    1,

  meetingJoined:
    1,

  status:
    1

});


/* =========================================================
   VIRTUAL — ATTENDANCE SCORE
========================================================= */

AttendanceSchema
  .virtual(
    "attendanceScore"
  )
  .get(
    function () {

      switch (
        this.status
      ) {

        case "present":

          return 100;


        case "late":

          return 70;


        case "excused":

          return 50;


        default:

          return 0;

      }

    }
  );


/* =========================================================
   VIRTUAL — SESSION DURATION

   Prefer stored durationMinutes.

   If unavailable but join/leave timestamps exist, derive it.
========================================================= */

AttendanceSchema
  .virtual(
    "calculatedDurationMinutes"
  )
  .get(
    function () {

      const storedDuration =
        Number(
          this.durationMinutes ||
          0
        );


      if(
        storedDuration >
        0
      ){

        return storedDuration;

      }


      if(
        !this.joinTime ||
        !this.leaveTime
      ){

        return 0;

      }


      const join =
        new Date(
          this.joinTime
        );


      const leave =
        new Date(
          this.leaveTime
        );


      if(
        Number.isNaN(
          join.getTime()
        ) ||
        Number.isNaN(
          leave.getTime()
        ) ||
        leave <= join
      ){

        return 0;

      }


      return Math.max(
        0,
        Math.round(
          (
            leave.getTime() -
            join.getTime()
          ) /
          60000
        )
      );

    }
  );


/* =========================================================
   VIRTUAL — ATTENDED
========================================================= */

AttendanceSchema
  .virtual(
    "attended"
  )
  .get(
    function () {

      return (
        this.status ===
          "present" ||
        this.status ===
          "late"
      );

    }
  );


/* =========================================================
   PRE-VALIDATE

   Keep common values internally consistent.
========================================================= */

AttendanceSchema.pre(
  "validate",
  function (
    next
  ) {

    /* =====================================================
       SCHEDULED SOURCE
    ===================================================== */

    if(
      this.scheduleId &&
      (
        !this.source ||
        this.source ===
          "manual"
      )
    ){

      this.source =
        "schedule";

    }


    /* =====================================================
       MEETING JOIN
    ===================================================== */

    if(
      this.joinTime
    ){

      this.meetingJoined =
        true;

    }


    /* =====================================================
       DURATION
    ===================================================== */

    if(
      this.joinTime &&
      this.leaveTime
    ){

      const join =
        new Date(
          this.joinTime
        );


      const leave =
        new Date(
          this.leaveTime
        );


      if(
        !Number.isNaN(
          join.getTime()
        ) &&
        !Number.isNaN(
          leave.getTime()
        ) &&
        leave >
          join
      ){

        this.durationMinutes =
          Math.max(
            0,
            Math.round(
              (
                leave.getTime() -
                join.getTime()
              ) /
              60000
            )
          );

      }

    }


    /* =====================================================
       LATE STATUS
    ===================================================== */

    if(
      this.status !==
      "late"
    ){

      this.lateMinutes =
        0;

    }


    /* =====================================================
       EXCUSED STATUS
    ===================================================== */

    if(
      this.status !==
      "excused"
    ){

      this.excusedBy =
        null;

      this.excusedAt =
        null;

    }


    /* =====================================================
       FINALIZATION
    ===================================================== */

    if(
      this.attendanceFinalized &&
      !this.finalizedAt
    ){

      this.finalizedAt =
        new Date();

    }


    this.lastActivityAt =
      new Date();


    next();

  }
);


/* =========================================================
   JSON SETTINGS
========================================================= */

AttendanceSchema.set(
  "toJSON",
  {

    virtuals:
      true

  }
);


AttendanceSchema.set(
  "toObject",
  {

    virtuals:
      true

  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "Attendance",
    AttendanceSchema
  );
