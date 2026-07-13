"use strict";

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const router = express.Router();

const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Notification = require("../models/Notification");

const AnalyticsEvent = require(
  "../models/AnalyticsEvent"
);

const {
  incrementDailyAnalytics
} = require(
  "../services/analyticsAggregationService"
);

const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const upload = require("../middleware/upload");
const analyticsContext = require(
  "../middleware/analyticsContext"
);

const cloudinary = require("../config/cloudinary");
function canSchoolManageUser(manager, targetUser) {
  if (!manager || !targetUser) return false;

  if (manager.role === "admin") return true;
  if (manager.role !== "school") return false;

  const schoolId = String(manager._id || manager.id);

  return (
    String(targetUser.schoolId || "") === schoolId ||
    String(targetUser.linkedSchoolId || "") === schoolId ||
    String(targetUser.companyId || "") === schoolId ||
    String(targetUser.createdBySchool || "") === schoolId
  );
}
/* ============================================
   SCHOOL ANALYTICS HELPERS
============================================ */

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );
}

function resolveLinkedSchoolId(user) {
  if (!user) {
    return null;
  }

  if (
    String(user.role || "").toLowerCase() ===
    "school"
  ) {
    return user._id || user.id || null;
  }

  return (
    user.schoolId ||
    user.linkedSchoolId ||
    user.companyId ||
    user.createdBySchool ||
    null
  );
}

function analyticsExpiryDate(
  occurredAt = new Date()
) {
  const expiresAt = new Date(occurredAt);

  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + 180
  );

  return expiresAt;
}

/*
  Record a trusted analytics event after the backend has
  validated and performed the real action.

  This helper is not exposed directly to the browser.
*/
async function recordSchoolAnalyticsEvent({
  req,
  schoolId,
  eventType,
  entityType = "school",
  entityId = null,
  metadata = {},
  occurredAt = new Date(),
  mongoSession = null
}) {
  if (
    !schoolId ||
    !validObjectId(schoolId)
  ) {
    throw new TypeError(
      "A valid schoolId is required for school analytics."
    );
  }

  const context =
    req.analyticsContext || {};

  const actorId =
    req.user?._id ||
    req.user?.id ||
    null;

  const source =
    context.source ||
    "dashboard";

  const deviceType =
    context.deviceType ||
    "unknown";

  const eventPayload = {
    schoolId,
    actorId:
      actorId && validObjectId(actorId)
        ? actorId
        : null,

    sessionId:
      context.sessionId ||
      null,

    ipHash:
      context.ipHash ||
      null,

    eventType,
    entityType,

    entityId:
      entityId && validObjectId(entityId)
        ? entityId
        : null,

    source,

    metadata:
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
        ? metadata
        : {},

    userAgent:
      context.userAgent ||
      null,

    referrer:
      context.referrer ||
      null,

    requestPath:
      context.requestPath ||
      null,

    deviceType,

    occurredAt,

    expiresAt:
      analyticsExpiryDate(
        occurredAt
      )
  };

  const createOptions = {};

  if (mongoSession) {
    createOptions.session =
      mongoSession;
  }

  const events =
    await AnalyticsEvent.create(
      [eventPayload],
      createOptions
    );

  await incrementDailyAnalytics({
    schoolId,
    eventType,
    occurredAt,
    source,
    deviceType,
    metadata: eventPayload.metadata,
    mongoSession
  });

  return events[0];
}
/* ============================================
   ADMIN GET ALL USERS
============================================ */
router.get("/", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ============================================
   ADMIN CREATE USER
============================================ */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      password: hashed,
      role
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

/* ============================================
   SCHOOL CREATE TEACHER / STUDENT
============================================ */

router.post(
  "/school-create",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !["school", "admin"].includes(
          req.user.role
        )
      ) {
        return res.status(403).json({
          message:
            "Only a school or administrator can create school users."
        });
      }

      const {
        name,
        email,
        password,
        role,
        course,
        subject,
        department,
        bio
      } = req.body;

      const cleanName =
        String(name || "").trim();

      const cleanEmail =
        String(email || "")
          .trim()
          .toLowerCase();

      const cleanRole =
        String(role || "")
          .trim()
          .toLowerCase();

      if (
        !["teacher", "student"].includes(
          cleanRole
        )
      ) {
        return res.status(400).json({
          message:
            "Role must be teacher or student."
        });
      }

      if (
        !cleanName ||
        !cleanEmail ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Name, email, and password are required."
        });
      }

      const requestedSchoolId =
        req.user.role === "admin"
          ? req.body.schoolId
          : req.user._id;

      if (
        !requestedSchoolId ||
        !validObjectId(requestedSchoolId)
      ) {
        return res.status(400).json({
          message:
            "A valid school ID is required."
        });
      }

      const school = await User.findOne({
        _id: requestedSchoolId,
        role: "school",
        status: {
          $ne: "suspended"
        }
      })
        .select("_id role status")
        .lean();

      if (!school) {
        return res.status(404).json({
          message:
            "School account was not found."
        });
      }

      const existing =
        await User.findOne({
          email: cleanEmail
        })
          .select("_id")
          .lean();

      if (existing) {
        return res.status(409).json({
          message:
            "A user with this email already exists."
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          String(password),
          12
        );

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const createdUsers =
        await User.create(
          [
            {
              name: cleanName,
              email: cleanEmail,
              password: hashedPassword,
              role: cleanRole,

              schoolId:
                school._id,

              linkedSchoolId:
                school._id,

              companyId:
                school._id,

              createdBySchool:
                req.user._id,

              course:
                cleanRole === "student"
                  ? course || null
                  : null,

              subject:
                cleanRole === "teacher"
                  ? subject ||
                    department ||
                    null
                  : null,

              department:
                cleanRole === "teacher"
                  ? department ||
                    subject ||
                    null
                  : null,

              bio:
                bio ||
                null
            }
          ],
          {
            session: mongoSession
          }
        );

      const createdUser =
        createdUsers[0];

      const eventType =
        cleanRole === "student"
          ? "student_added"
          : "teacher_added";

      await recordSchoolAnalyticsEvent({
        req,

        schoolId:
          school._id,

        eventType,

        entityType:
          cleanRole,

        entityId:
          createdUser._id,

        metadata: {
          createdRole:
            cleanRole,

          createdByRole:
            req.user.role,

          course:
            cleanRole === "student"
              ? String(course || "")
                  .trim()
                  .slice(0, 200)
              : "",

          department:
            cleanRole === "teacher"
              ? String(
                  department ||
                  subject ||
                  ""
                )
                  .trim()
                  .slice(0, 200)
              : ""
        },

        mongoSession
      });

      await mongoSession
        .commitTransaction();

      const safeUser =
        await User.findById(
          createdUser._id
        ).select("-password");

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(school._id)
        ).emit(
          "user:new",
          safeUser
        );
      }

      return res
        .status(201)
        .json(safeUser);
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SCHOOL CREATE USER ERROR:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          message:
            "A user with this email already exists."
        });
      }

      return res.status(500).json({
        message:
          error.message ||
          "Failed to create school user."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ============================================
   GET CURRENT USER
============================================ */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    let score = 0;
    if (user.profileImage) score += 15;
    if (user.bannerImage) score += 10;
    if (user.bio) score += 15;
    if (user.skills?.length) score += 20;
    if (user.experience?.length) score += 20;
    if (user.cvUrl) score += 20;

    res.json({
      ...user.toObject(),
      completeness: score
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load user" });
  }
});

/* ============================================
   FOLLOWERS / FOLLOWING
============================================ */
router.get("/me/followers", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "name profileImage headline role");
    res.json(user.followers);
  } catch (err) {
    res.status(500).json({ message: "Failed to load followers" });
  }
});

router.get("/me/following", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("following", "name profileImage headline role");
    res.json(user.following);
  } catch (err) {
    res.status(500).json({ message: "Failed to load following" });
  }
});

/* ============================================
   UPDATE PROFILE
============================================ */
router.patch(
  "/profile",
  auth,
upload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "bannerImage", maxCount: 1 },
  { name: "banner", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "cv", maxCount: 1 }
]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

const assignIfPresent = (field) => {
  if (req.body[field] !== undefined) {
    user[field] = String(req.body[field]).trim();
  }
};

[
  "name",
  "headline",
  "bio",
  "location",
  "website",
  "companyName",
  "industry",
  "contactEmail",
  "contactPhone",
  "department",
  "profession",
  "availability",
  "workPreference",
  "preferredRole",
  "salaryExpectation",
  "noticePeriod",
  "workSetup",
  "preferredShift",
  "employmentType",
  "schoolName",
  "schoolDescription",
  "address",
   "phone",
"schoolType"
].forEach(assignIfPresent);

if (req.body.yearsOfExperience !== undefined || req.body.experienceYears !== undefined) {
  user.yearsOfExperience = Number(req.body.yearsOfExperience || req.body.experienceYears || 0);
}

if (req.body.programs) {
  try {
    const parsed = JSON.parse(req.body.programs);
    user.programs = Array.isArray(parsed) ? parsed : [];
  } catch {
    user.programs = String(req.body.programs)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }
}
      if (req.body.experience) {
        try { user.experience = JSON.parse(req.body.experience); } catch {}
      }
      if (req.body.education) {
        try { user.education = JSON.parse(req.body.education); } catch {}
      }
       if (req.body.portfolio) {
  try { user.portfolio = JSON.parse(req.body.portfolio); } catch {}
}
       if (req.body.employerPraise) {
  try { user.employerPraise = JSON.parse(req.body.employerPraise); } catch {}
}

if (req.body.achievements) {
  try { user.achievements = JSON.parse(req.body.achievements); } catch {}
}

if (req.body.performanceMetrics) {
  try { user.performanceMetrics = JSON.parse(req.body.performanceMetrics); } catch {}
}
      if (req.body.skills) {
  try { user.skills = JSON.parse(req.body.skills); } catch {}
}

if (req.body.languages) {
  try { user.languages = JSON.parse(req.body.languages); } catch {}
}

if (req.body.services) {
  try { user.services = JSON.parse(req.body.services); } catch {}
}

if (req.body.tools) {
  try { user.tools = JSON.parse(req.body.tools); } catch {}
}

if (req.body.industries) {
  try { user.industries = JSON.parse(req.body.industries); } catch {}
}

if (req.body.certifications) {
  try { user.certifications = JSON.parse(req.body.certifications); } catch {}
}
if (req.body.isPublic !== undefined) {
  user.isPublic =
    req.body.isPublic === "true" ||
    req.body.isPublic === true;
}

if (req.body.showEmail !== undefined) {
  user.showEmail =
    req.body.showEmail === "true" ||
    req.body.showEmail === true;
}

if (req.body.showPhone !== undefined) {
  user.showPhone =
    req.body.showPhone === "true" ||
    req.body.showPhone === true;
}

if (req.body.showCV !== undefined) {
  user.showCV =
    req.body.showCV === "true" ||
    req.body.showCV === true;
}

if (req.body.allowMessages !== undefined) {
  user.allowMessages =
    req.body.allowMessages === "true" ||
    req.body.allowMessages === true;
}

if (req.body.allowProfileIndexing !== undefined) {
  user.allowProfileIndexing =
    req.body.allowProfileIndexing === "true" ||
    req.body.allowProfileIndexing === true;
}
      const logoFile = req.files?.profileImage?.[0] || req.files?.logo?.[0];

if (logoFile) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_profiles", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(logoFile.buffer);
        });
        user.profileImage = result.secure_url;
   user.schoolLogo = result.secure_url;
      }

     const bannerFile =
  req.files?.bannerImage?.[0] ||
  req.files?.banner?.[0] ||
  req.files?.coverImage?.[0];

if (bannerFile) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_banners", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(bannerFile.buffer);
        });
        user.bannerImage = result.secure_url;
   user.schoolBanner = result.secure_url;
      }
       if (req.body.removeCV === "true") {
  user.cvUrl = "";
}

      if (req.files?.cv?.[0]) {
        const result = await new Promise((resolve, reject) => {
cloudinary.uploader.upload_stream(
  {
    folder: "aift_cvs",
    resource_type: "raw",
    type: "upload",
    access_mode: "public",
    use_filename: true,
    unique_filename: true
  },
  (error, output) => error ? reject(error) : resolve(output)
).end(req.files.cv[0].buffer);
        });
        user.cvUrl = result.secure_url;
      }

      await user.save();
      res.json(user);
    } catch (err) {
      console.error("PROFILE UPDATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ============================================
   FOLLOW / UNFOLLOW
============================================ */

router.patch(
  "/:id/follow",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      const currentUserId =
        req.user._id ||
        req.user.id;

      const targetUserId =
        req.params.id;

      if (
        !validObjectId(targetUserId)
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID."
        });
      }

      if (
        String(currentUserId) ===
        String(targetUserId)
      ) {
        return res.status(400).json({
          message:
            "You cannot follow yourself."
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const [
        currentUser,
        targetUser
      ] = await Promise.all([
        User.findById(currentUserId)
          .session(mongoSession),

        User.findById(targetUserId)
          .session(mongoSession)
      ]);

      if (!currentUser) {
        await mongoSession
          .abortTransaction();

        return res.status(401).json({
          message:
            "Current user was not found."
        });
      }

      if (!targetUser) {
        await mongoSession
          .abortTransaction();

        return res.status(404).json({
          message:
            "User not found."
        });
      }

      if (
        targetUser.status === "suspended"
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "This account is unavailable."
        });
      }

      const alreadyFollowing =
        Array.isArray(
          currentUser.following
        ) &&
        currentUser.following.some(
          id =>
            String(id) ===
            String(targetUser._id)
        );

      let following;

      if (alreadyFollowing) {
        currentUser.following.pull(
          targetUser._id
        );

        targetUser.followers.pull(
          currentUser._id
        );

        following = false;
      } else {
        currentUser.following.addToSet(
          targetUser._id
        );

        targetUser.followers.addToSet(
          currentUser._id
        );

        following = true;
      }

      await currentUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      await targetUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      if (following) {
        await Notification.create(
          [
            {
              user:
                targetUser._id,

              type:
                "follow",

              sender:
                currentUser._id,

              text:
                `${currentUser.name || "Someone"} started following you`,

              link:
                `/public-profile.html?id=${currentUser._id}`
            }
          ],
          {
            session:
              mongoSession
          }
        );
      }

      /*
        School follower analytics belongs only to target
        accounts whose role is school.

        Other user roles continue to follow normally, but they
        do not create school analytics records.
      */
      if (
        targetUser.role === "school"
      ) {
        await recordSchoolAnalyticsEvent({
          req,

          schoolId:
            targetUser._id,

          eventType:
            following
              ? "follow"
              : "unfollow",

          entityType:
            "school",

          entityId:
            targetUser._id,

          metadata: {
            followerRole:
              currentUser.role ||
              "unknown"
          },

          mongoSession
        });
      }

      await mongoSession
        .commitTransaction();

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(targetUser._id)
        ).emit(
          "user_follow_updated",
          {
            followerId:
              currentUser._id,

            targetId:
              targetUser._id,

            following,

            followers:
              targetUser.followers.length
          }
        );
      }

      return res.json({
        following,

        targetId:
          targetUser._id,

        followers:
          targetUser.followers.length
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "FOLLOW ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Follow operation failed."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ============================================
   PUBLIC NETWORK PREVIEW
   GET /api/users/network/public
============================================ */
router.get("/network/public", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 60, 100);

    const users = await User.find({
      role: { $in: ["talent", "agent", "employer", "school"] },
      isBlockedByEmployer: { $ne: true },
      status: { $ne: "suspended" },
      isPublic: { $ne: false }
    })
      .select(
        "_id name headline bio role profileImage bannerImage followers skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified department course companyId teamRole education experience expectedSalary companyName industry schoolName programs location"
      )
      .sort({
        aiftVerified: -1,
        aiftCertified: -1,
        createdAt: -1
      })
      .limit(limit);

    res.json(users);
  } catch (err) {
    console.error("PUBLIC NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load public network" });
  }
});

/* ============================================
   NETWORK
============================================ */
router.get("/network", auth, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id }
    }).select("_id name email headline bio role profileImage bannerImage followers following skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified department course companyId teamRole isBlockedByEmployer education experience expectedSalary companyName industry schoolName programs location");

    res.json(users);
  } catch (err) {
    console.error("NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});

/* ============================================
   JOB SEEKER DISCOVERY
============================================ */
router.get("/jobseekers/discover", auth, async (req, res) => {
  try {
    const query = {
      role: { $in: ["talent", "agent"] },
      isBlockedByEmployer: { $ne: true }
    };

    if (req.query.skill) {
      query.skills = { $in: [new RegExp(req.query.skill, "i")] };
    }

    if (req.query.keyword) {
      query.$or = [
        { name: new RegExp(req.query.keyword, "i") },
        { headline: new RegExp(req.query.keyword, "i") },
        { bio: new RegExp(req.query.keyword, "i") },
        { skills: { $in: [new RegExp(req.query.keyword, "i")] } }
      ];
    }

    if (req.query.department) {
      query.department = new RegExp(req.query.department, "i");
    }

    const users = await User.find(query)
      .select("_id name email role headline bio profileImage skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified education experience expectedSalary location companyId teamRole")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to discover job seekers" });
  }
});

/* ============================================
   EMPLOYER PUBLIC PROFILE
   GET /api/users/employer/:id/public
============================================ */
router.get("/employer/:id/public", async (req, res) => {
  try {
    const employer = await User.findById(req.params.id)
      .select(
        "_id name email role companyName headline bio location website profileImage bannerImage contactEmail contactPhone industry companyTags followers following aiftVerified aiftCertified createdAt"
      )
      .populate("followers", "_id name profileImage headline role")
      .populate("following", "_id name profileImage headline role");

    if (!employer) {
      return res.status(404).json({ message: "Employer not found" });
    }

    if (!["employer", "school"].includes(employer.role)) {
      return res.status(400).json({ message: "This profile is not an employer profile" });
    }

    const jobs = await Job.find({
      employerId: employer._id,
      status: "active"
    })
      .select("_id title location type salary description status createdAt viewsCount applicationsCount")
      .sort({ createdAt: -1 })
      .limit(20);

    const applicationsCount = await Application.countDocuments({
      employerId: employer._id
    });

    const team = await User.find({
      companyId: employer._id,
      isBlockedByEmployer: { $ne: true }
    })
      .select("_id name profileImage headline teamRole department profession location skills languages aiftVerified aiftCertified")
      .sort({ createdAt: -1 })
      .limit(60);

    let posts = [];
    try {
      const Post = require("../models/Post");

      posts = await Post.find({
        author: employer._id,
        isHiddenByAdmin: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("author", "name companyName profileImage headline role aiftVerified aiftCertified followers")
        .populate("comments.user", "name profileImage headline role")
        .populate("comments.replies.user", "name profileImage headline role");
    } catch (postErr) {
      console.warn("PUBLIC EMPLOYER POSTS SKIPPED:", postErr.message);
      posts = [];
    }

    res.json({
      employer,
      jobs,
      team,
      posts,
      stats: {
        activeJobs: jobs.length,
        totalApplications: applicationsCount,
        teamMembers: team.length,
        followers: employer.followers?.length || 0,
        following: employer.following?.length || 0,
        posts: posts.length
      }
    });
  } catch (err) {
    console.error("EMPLOYER PUBLIC PROFILE ERROR:", err);
    res.status(500).json({ message: "Failed to load employer public profile" });
  }
});
/* ============================================
   PUBLIC PROFILE
============================================ */
router.get("/:id/cv/inline", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("cvUrl showCV isPublic");

    if (!user || !user.cvUrl) {
      return res.status(404).send("CV not found");
    }

    if (user.showCV === false || user.isPublic === false) {
      return res.status(403).send("CV is private");
    }

    const fileRes = await fetch(user.cvUrl);

    if (!fileRes.ok) {
      return res.status(404).send("Could not load CV");
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=cv.pdf");
    res.setHeader("Cache-Control", "public, max-age=3600");

    return res.send(buffer);

  } catch (err) {
    console.error("INLINE CV ERROR:", err);
    res.status(500).send("CV preview failed");
  }
});

router.get("/:id/public", async (req, res) => {
  try {

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate(
        "followers",
        "name profileImage headline role"
      )
      .populate(
        "following",
        "name profileImage headline role"
      )
      .populate(
        "companyId",
        "name companyName profileImage bannerImage headline"
      )
      .populate(
        "schoolId",
        "name schoolName schoolLogo schoolBanner"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if(user.isPublic === false){
      return res.status(403).json({
        message: "This profile is private"
      });
    }

/*
  School profile views are recorded through the dedicated
  analytics event endpoint, which provides:

  - session deduplication
  - self-view prevention
  - unique visitor tracking
  - traffic-source tracking
  - device tracking

  Continue preserving the legacy counter behavior for other
  profile roles until their analytics migration is completed.
*/
if (user.role !== "school") {
  user.profileViews =
    Number(
      user.profileViews || 0
    ) + 1;

  await user.save({
    validateModifiedOnly: true
  });
}

    let posts = [];

    try{

      const Post =
        require("../models/Post");

      posts = await Post.find({
        author:user._id,
        isHiddenByAdmin:{
          $ne:true
        }
      })
      .sort({ createdAt:-1 })
      .limit(25)
      .populate(
        "author",
        "name profileImage headline role aiftVerified aiftCertified"
      );

    }catch(postErr){

      console.warn(
        "PUBLIC POSTS ERROR:",
        postErr.message
      );

    }

    res.json({
      user,
      posts,
      stats:{
        followers:user.followers?.length || 0,
        following:user.following?.length || 0,
        skills:user.skills?.length || 0,
        languages:user.languages?.length || 0,
        experience:user.experience?.length || 0,
        education:user.education?.length || 0,
        profileViews:user.profileViews || 0
      }
    });

  } catch (err) {

    console.error(
      "PUBLIC PROFILE ERROR:",
      err
    );

    res.status(500).json({
      message: "Failed to load profile"
    });

  }
});

/* ============================================
   ADMIN
============================================ */
router.patch("/:id", auth, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isAdmin = req.user.role === "admin";
    const isSchoolAllowed = canSchoolManageUser(req.user, targetUser);

    if (!isAdmin && !isSchoolAllowed) {
      return res.status(403).json({ message: "Not allowed to update this user" });
    }

    const allowedFields = [
      "name",
      "email",
      "role",
      "status",
      "course",
      "subject",
      "department",
      "bio",
      "teacherBio",
      "studentBio",
      "schoolId",
      "linkedSchoolId",
      "companyId"
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        targetUser[field] = req.body[field];
      }
    });

    if (req.body.password) {
      targetUser.password = await bcrypt.hash(req.body.password, 10);
    }

    if (!isAdmin) {
      if (!["teacher", "student"].includes(String(targetUser.role))) {
        return res.status(403).json({ message: "School can only update teachers/students" });
      }

      targetUser.schoolId = req.user._id;
      targetUser.linkedSchoolId = req.user._id;
      targetUser.companyId = req.user._id;
    }

    await targetUser.save();

    const updated = await User.findById(targetUser._id).select("-password");

    res.json(updated);
  } catch (err) {
    console.error("SCHOOL USER UPDATE ERROR:", err);
    res.status(400).json({ message: err.message || "Failed to update user" });
  }
});

router.patch("/:id/password", adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(req.params.id, { password: hashed });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("ADMIN PASSWORD ERROR:", err);
    res.status(400).json({ message: "Failed to update password" });
  }
});

router.delete(
  "/:id",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !validObjectId(req.params.id)
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID."
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const targetUser =
        await User.findById(
          req.params.id
        ).session(mongoSession);

      if (!targetUser) {
        await mongoSession
          .abortTransaction();

        return res.status(404).json({
          message:
            "User not found."
        });
      }

      const isAdmin =
        req.user.role === "admin";

      const isSchoolAllowed =
        canSchoolManageUser(
          req.user,
          targetUser
        );

      if (
        !isAdmin &&
        !isSchoolAllowed
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "Not allowed to remove this user."
        });
      }

      const targetRole =
        String(
          targetUser.role || ""
        ).toLowerCase();

      const linkedSchoolId =
        resolveLinkedSchoolId(
          targetUser
        );

      /*
        Administrators permanently delete users.

        When the deleted account belonged to a school as a
        teacher or student, record the removal first.
      */
      if (isAdmin) {
        if (
          linkedSchoolId &&
          ["teacher", "student"].includes(
            targetRole
          )
        ) {
          await recordSchoolAnalyticsEvent({
            req,

            schoolId:
              linkedSchoolId,

            eventType:
              targetRole === "teacher"
                ? "teacher_removed"
                : "student_removed",

            entityType:
              targetRole,

            entityId:
              targetUser._id,

            metadata: {
              removalType:
                "permanent_delete",

              removedByRole:
                req.user.role
            },

            mongoSession
          });
        }

        await targetUser.deleteOne({
          session: mongoSession
        });

        await mongoSession
          .commitTransaction();

        return res.json({
          message:
            "User deleted successfully."
        });
      }

      if (
        ![
          "teacher",
          "student",
          "talent"
        ].includes(targetRole)
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "School can only remove teachers or students."
        });
      }

      const schoolId =
        req.user._id;

      targetUser.schoolId = null;
      targetUser.linkedSchoolId = null;
      targetUser.companyId = null;
      targetUser.createdBySchool = null;

      if (targetRole === "teacher") {
        targetUser.assignedClasses = [];
      }

      await targetUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      if (
        ["teacher", "student"].includes(
          targetRole
        )
      ) {
        await recordSchoolAnalyticsEvent({
          req,

          schoolId,

          eventType:
            targetRole === "teacher"
              ? "teacher_removed"
              : "student_removed",

          entityType:
            targetRole,

          entityId:
            targetUser._id,

          metadata: {
            removalType:
              "school_unlink",

            removedByRole:
              req.user.role
          },

          mongoSession
        });
      }

      await mongoSession
        .commitTransaction();

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(schoolId)
        ).emit(
          "user:removed",
          {
            userId:
              targetUser._id,

            role:
              targetRole
          }
        );
      }

      return res.json({
        message:
          "User removed from school."
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SCHOOL USER DELETE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error.message ||
          "Failed to remove user."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

router.get("/activity", auth, async (req, res) => {
  const applications = await Application.find({ applicantId: req.user.id });
  const user = await User.findById(req.user.id);

  res.json({
    totalApplications: applications.length,
    savedJobs: user.savedJobs.length
  });
});

router.get("/suggestions", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const suggestions = await User.find({
      _id: { $ne: req.user.id, $nin: user.following || [] }
    })
      .limit(5)
      .select("name profileImage headline role");

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: "Failed to load suggestions" });
  }
});

module.exports = router;
