const AnalyticsDaily = require("../models/AnalyticsDaily");

const FIELD_MAP = {
  profile_view: "profileViews",
  profile_unique_view: "uniqueProfileViews",

  follow: "followersGained",
  unfollow: "followersLost",

  post_impression: "postImpressions",
  post_view: "postViews",
  post_like: "postLikes",
  post_unlike: "postLikes",
  post_comment: "postComments",
  post_share: "postShares",
  post_save: "postSaves",

  student_view: "studentViews",
  student_added: "studentsAdded",

  class_view: "classViews",
  class_created: "classesCreated",

  attendance_present: "attendancePresent",
  attendance_late: "attendanceLate",
  attendance_absent: "attendanceAbsent",
  attendance_excused: "attendanceExcused",

  assignment_created: "assignmentsCreated",
  assignment_submitted: "assignmentsSubmitted",
  assignment_reviewed: "assignmentsReviewed",

  career_view: "careerViews",
  career_application: "careerApplications",
  career_placement: "careerPlacements",

  search_impression: "searchImpressions",
  search_click: "searchClicks"
};

function dateKey(date = new Date()){
  return date.toISOString().slice(0,10);
}

async function incrementDailyAnalytics({
  schoolId,
  eventType,
  occurredAt = new Date()
}){
  const field = FIELD_MAP[eventType];

  if(!field){
    return;
  }

  let amount = 1;

  if(eventType === "post_unlike"){
    amount = -1;
  }

  await AnalyticsDaily.updateOne(
    {
      schoolId,
      date:dateKey(occurredAt)
    },
    {
      $inc:{
        [field]:amount
      }
    },
    {
      upsert:true
    }
  );
}

module.exports = {
  dateKey,
  incrementDailyAnalytics
};
