const crypto = require("crypto");
const mongoose = require("mongoose");

const AnalyticsEvent = require("../models/AnalyticsEvent");
const AnalyticsDaily = require("../models/AnalyticsDaily");
const User = require("../models/User");
const Class = require("../models/Class");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Attendance = require("../models/Attendance");
const SchoolOpportunity = require("../models/SchoolOpportunity");

const {
  incrementDailyAnalytics
} = require("../services/analyticsAggregationService");

function safeObjectId(value){
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;
}

function hashIp(ip){
  if(!ip){
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(String(ip))
    .digest("hex");
}

function resolveDateRange(range){
  const now = new Date();

  if(range === "all"){
    return {
      start:null,
      end:now,
      label:"All time"
    };
  }

  const days = Math.max(
    1,
    Math.min(Number(range) || 30,3650)
  );

  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0,0,0,0);

  return {
    start,
    end:now,
    days,
    label:`Last ${days} days`
  };
}

async function recordEvent(req,res){
  try{
    const {
      schoolId,
      eventType,
      entityType = "school",
      entityId = null,
      source = "unknown",
      sessionId = null,
      metadata = {}
    } = req.body;

    if(!safeObjectId(schoolId)){
      return res.status(400).json({
        message:"Valid schoolId is required."
      });
    }

    if(!eventType){
      return res.status(400).json({
        message:"eventType is required."
      });
    }

    const actorId =
      safeObjectId(req.user?._id) ||
      safeObjectId(req.user?.id);

    const occurredAt = new Date();

    const event = await AnalyticsEvent.create({
      schoolId,
      actorId,
      sessionId,
      eventType,
      entityType,
      entityId:safeObjectId(entityId),
      source,
      metadata,
      ipHash:hashIp(
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress
      ),
      userAgent:req.headers["user-agent"] || null,
      occurredAt
    });

    await incrementDailyAnalytics({
      schoolId,
      eventType,
      occurredAt
    });

    return res.status(201).json({
      success:true,
      eventId:event._id
    });
  }catch(error){
    console.error("recordEvent error:",error);

    return res.status(500).json({
      message:"Could not record analytics event."
    });
  }
}

async function getSchoolAnalytics(req,res){
  try{
    const schoolId =
      safeObjectId(req.params.schoolId) ||
      safeObjectId(req.user?._id) ||
      safeObjectId(req.user?.id);

    if(!schoolId){
      return res.status(400).json({
        message:"Valid school ID is required."
      });
    }

    const range = resolveDateRange(
      req.query.range || "30"
    );

    const dateQuery = range.start
      ? {
          $gte:range.start.toISOString().slice(0,10),
          $lte:range.end.toISOString().slice(0,10)
        }
      : {
          $lte:range.end.toISOString().slice(0,10)
        };

    const daily = await AnalyticsDaily.find({
      schoolId,
      date:dateQuery
    })
      .sort({date:1})
      .lean();

    const [
      school,
      studentCount,
      teacherCount,
      classCount,
      assignmentCount,
      submissionCount,
      attendanceRows,
      opportunityCount
    ] = await Promise.all([
      User.findById(schoolId)
        .select(
          "followers followersCount profileViews publicProfileViews"
        )
        .lean(),

      User.countDocuments({
        schoolId,
        role:"student"
      }),

      User.countDocuments({
        schoolId,
        role:"teacher"
      }),

      Class.countDocuments({
        schoolId
      }),

      Assignment.countDocuments({
        schoolId
      }),

      Submission.countDocuments({
        schoolId
      }),

      Attendance.find({
        schoolId
      })
        .select("status participation")
        .lean(),

      SchoolOpportunity.countDocuments({
        schoolId
      })
    ]);

    const summary = daily.reduce(
      (acc,row) => {
        Object.keys(acc).forEach(key => {
          acc[key] += Number(row[key] || 0);
        });

        return acc;
      },
      {
        profileViews:0,
        uniqueProfileViews:0,
        followersGained:0,
        followersLost:0,
        postImpressions:0,
        postViews:0,
        postLikes:0,
        postComments:0,
        postShares:0,
        postSaves:0,
        studentViews:0,
        studentsAdded:0,
        classViews:0,
        classesCreated:0,
        attendancePresent:0,
        attendanceLate:0,
        attendanceAbsent:0,
        attendanceExcused:0,
        assignmentsCreated:0,
        assignmentsSubmitted:0,
        assignmentsReviewed:0,
        careerViews:0,
        careerApplications:0,
        careerPlacements:0,
        searchImpressions:0,
        searchClicks:0
      }
    );

    const attendanceTotal = attendanceRows.length;

    const presentEquivalent = attendanceRows.reduce(
      (total,row) => {
        const status = String(row.status || "").toLowerCase();

        if(status === "present"){
          return total + 1;
        }

        if(status === "late"){
          return total + 0.75;
        }

        return total;
      },
      0
    );

    const attendanceRate = attendanceTotal
      ? Math.round(
          presentEquivalent /
          attendanceTotal *
          100
        )
      : 0;

    const participationAverage = attendanceTotal
      ? Math.round(
          attendanceRows.reduce(
            (sum,row) =>
              sum + Number(row.participation || 0),
            0
          ) / attendanceTotal
        )
      : 0;

    const expectedSubmissions =
      studentCount * assignmentCount;

    const completionRate = expectedSubmissions
      ? Math.min(
          100,
          Math.round(
            submissionCount /
            expectedSubmissions *
            100
          )
        )
      : 0;

    const currentFollowers = Math.max(
      Array.isArray(school?.followers)
        ? school.followers.length
        : 0,
      Number(school?.followersCount || 0)
    );

    const currentProfileViews = Math.max(
      Number(school?.profileViews || 0),
      Number(school?.publicProfileViews || 0),
      summary.profileViews
    );

    const totalEngagement =
      summary.postLikes +
      summary.postComments +
      summary.postShares +
      summary.postSaves;

    const engagementRate = summary.postViews
      ? Number(
          (
            totalEngagement /
            summary.postViews *
            100
          ).toFixed(2)
        )
      : 0;

    const searchClickRate = summary.searchImpressions
      ? Number(
          (
            summary.searchClicks /
            summary.searchImpressions *
            100
          ).toFixed(2)
        )
      : 0;

    const overallScore = Math.round(
      (
        attendanceRate +
        completionRate +
        participationAverage +
        Math.min(100,engagementRate * 5) +
        Math.min(100,classCount * 10)
      ) / 5
    );

    return res.json({
      range,

      summary:{
        ...summary,

        currentFollowers,
        currentProfileViews,

        netFollowers:
          summary.followersGained -
          summary.followersLost,

        engagementTotal:totalEngagement,
        engagementRate,
        searchClickRate,

        studentCount,
        teacherCount,
        classCount,
        assignmentCount,
        submissionCount,
        opportunityCount,

        attendanceRate,
        participationAverage,
        completionRate,
        overallScore
      },

      daily:daily.map(row => ({
        date:row.date,
        profileViews:row.profileViews,
        uniqueProfileViews:row.uniqueProfileViews,
        followersGained:row.followersGained,
        followersLost:row.followersLost,
        postImpressions:row.postImpressions,
        postViews:row.postViews,
        postLikes:row.postLikes,
        postComments:row.postComments,
        postShares:row.postShares,
        postSaves:row.postSaves,
        studentViews:row.studentViews,
        classViews:row.classViews,
        attendancePresent:row.attendancePresent,
        attendanceLate:row.attendanceLate,
        attendanceAbsent:row.attendanceAbsent,
        assignmentsSubmitted:row.assignmentsSubmitted,
        assignmentsReviewed:row.assignmentsReviewed,
        careerViews:row.careerViews,
        careerApplications:row.careerApplications,
        careerPlacements:row.careerPlacements,
        searchImpressions:row.searchImpressions,
        searchClicks:row.searchClicks
      }))
    });
  }catch(error){
    console.error("getSchoolAnalytics error:",error);

    return res.status(500).json({
      message:"Could not load school analytics."
    });
  }
}

module.exports = {
  recordEvent,
  getSchoolAnalytics
};
