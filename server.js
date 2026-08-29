const messageRoutes = require("./routes/messages");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const User = require("./models/User");

require("dotenv").config();

const authRoutes = require("./routes/auth");
const jobsRoutes = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");
const adminStatsRoutes = require("./routes/adminStats");
const userRoutes = require("./routes/users");
const postRoutes = require("./routes/posts");
const notificationRoutes = require("./routes/notifications");
const employerTeamRoutes = require("./routes/employerTeam");
const scheduleRoutes = require("./routes/schedules");
const taskRoutes = require("./routes/tasks");
const inviteRoutes = require("./routes/invites");

const workTaskRoutes = require("./routes/workTasks");
const taskTemplateRoutes = require("./routes/taskTemplates");
const agentSessionRoutes = require("./routes/agentSessions");

const classRoutes = require("./routes/classes");
const projectRoutes = require("./routes/projects");
const assignmentRoutes = require("./routes/Assignment");
const submissionRoutes = require("./routes/submissions");
const opportunityRoutes =
  require("./routes/opportunities");

const schoolCompanyPartnershipRoutes =
  require("./routes/schoolCompanyPartnerships");

const internshipApplicationRoutes =
  require("./routes/internshipApplications");

const campusRecruitmentCampaignRoutes =
  require("./routes/campusRecruitmentCampaigns");

const scholarshipRoutes =
  require("./routes/scholarships");

const scholarshipApplicationRoutes =
  require("./routes/scholarshipApplications");

const careerEventRoutes =
  require("./routes/careerEvents");

const careerEventRegistrationRoutes =
  require("./routes/careerEventRegistrations");

const schoolUpdateRoutes =
  require("./routes/schoolUpdates");

const attendanceRoutes =
  require("./routes/attendance");

const analyticsRoutes =
  require("./routes/analytics");

const savedRoutes =
  require("./routes/saved");

const ventureRoutes =
  require("./routes/ventures");
const groupRoutes = require("./routes/groups");
const conversationRoutes = require("./routes/conversations");
const meetingRoutes = require("./routes/meetings");
const callLogRoutes = require("./routes/callLogs");
const notificationPreferenceRoutes = require("./routes/notificationPreferences");
const messageTemplateRoutes = require("./routes/messageTemplates");
const conferenceRecordingRoutes = require("./routes/conferenceRecordings");
const conferenceTranscriptRoutes = require("./routes/conferenceTranscripts");
const chatBotConversationRoutes = require("./routes/chatBotConversations");
const chatAssetRoutes = require("./routes/chatAssets");

const classModuleRoutes = require("./routes/classModules");
const classLessonRoutes = require("./routes/classLessons");
const quizRoutes = require("./routes/quizzes");
const questionBankRoutes = require("./routes/questionBank");
const lessonProgressRoutes = require("./routes/lessonProgress");
const uploadRoutes = require("./routes/uploads");
const studentResourceRoutes = require("./routes/studentResources");
const certificateRoutes = require("./routes/certificates");
const studentPortfolioRoutes = require("./routes/studentPortfolio");

/* ============================================
   KABEZYA AI
============================================ */

/*
  Student Kabezya

  Existing Student AI system.
*/
const studentAIRoutes =
  require(
    "./routes/studentAI"
  );


/*
  Teacher Kabezya

  Existing Teacher Studio AI system.
*/
const teacherKabezyaRoutes =
  require(
    "./routes/teacherKabezya"
  );


/*
  Employer Kabezya

  Employer-specific AI assistant with isolated
  conversations, hiring context and Employer
  authorization.
*/
const employerKabezyaRoutes =
  require(
    "./routes/employerKabezya"
  );


const supportRoutes =
  require(
    "./routes/support"
  );


const mediaRoutes =
  require(
    "./routes/media"
  );

const app = express();

/*
  Render places the Node.js application behind one reverse proxy.

  This allows Express and express-rate-limit to correctly use
  the original visitor IP forwarded by Render.

  Use the number 1 rather than true so the application does
  not trust an unlimited proxy chain.
*/
app.set("trust proxy", 1);

/* ============================================
   CORS
============================================ */

const PRODUCTION_FRONTEND_ORIGINS = [
  "https://job-platform-frontend-nine.vercel.app"
];

const configuredFrontendOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_SECONDARY
]
  .map(value => String(value || "").trim())
  .filter(Boolean);

const developmentOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5500"
];


/*
  Capacitor Android WebView origin.

  AIFT Android packages the frontend locally rather than
  loading the Vercel website remotely.

  capacitor.config.json uses:

    hostname: "localhost"
    androidScheme: "https"

  Therefore Android web requests are made from:

    https://localhost

  Keep this separate from normal browser-development origins
  so native application access remains explicit and auditable.
*/
const capacitorOrigins = [
  "https://localhost"
];


const allowedOrigins = new Set([
  ...PRODUCTION_FRONTEND_ORIGINS,
  ...configuredFrontendOrigins,
  ...developmentOrigins,
  ...capacitorOrigins
]);

function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/+$/, "");
}

function isAllowedVercelOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return false;
  }

  try {
    const parsedOrigin = new URL(normalizedOrigin);

    return (
      parsedOrigin.protocol === "https:" &&
      parsedOrigin.hostname.endsWith(".vercel.app")
    );
  } catch (error) {
    return false;
  }
}

function validateRequestOrigin(origin, callback) {
  /*
    Requests without an Origin header may include:

    - Render health checks
    - server-to-server requests
    - Postman or API testing applications
    - some native clients
  */
  if (!origin) {
    return callback(null, true);
  }

  const normalizedOrigin = normalizeOrigin(origin);

  const originIsExplicitlyAllowed =
    Array.from(allowedOrigins).some(
      allowedOrigin =>
        normalizeOrigin(allowedOrigin) ===
        normalizedOrigin
    );

  if (
    originIsExplicitlyAllowed ||
    isAllowedVercelOrigin(normalizedOrigin)
  ) {
    return callback(null, true);
  }

  console.error("[CORS] Blocked request origin:", {
    origin: normalizedOrigin,
    allowedOrigins:
      Array.from(allowedOrigins)
  });

  const corsError = new Error(
    `Origin is not allowed by CORS: ${normalizedOrigin}`
  );

  corsError.statusCode = 403;
  corsError.code = "CORS_ORIGIN_DENIED";

  return callback(corsError);
}

const corsOptions = {
  origin:
    validateRequestOrigin,

  methods: [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Accept",
    "Authorization",
    "Content-Type",
    "Origin",
    "X-Requested-With",
    "Cache-Control",
    "Pragma",
    "Range",
    "If-None-Match",
    "X-Analytics-Session",
    "X-Analytics-Source"
  ],

  exposedHeaders: [
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "Accept-Ranges",
    "ETag",
    "RateLimit",
    "RateLimit-Policy",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset"
  ],

  /*
    Some Media Library modules use credentials: "include".

    Access-Control-Allow-Credentials must therefore be enabled
    for cross-origin browser requests.
  */
  credentials:
    true,

  preflightContinue:
    false,

  optionsSuccessStatus:
    204,

  maxAge:
    86400
};

app.use(
  cors(corsOptions)
);

/*
  Handle every preflight request before authentication,
  uploads, routes, and other middleware execute.

  The regular expression is compatible with newer Express
  and path-to-regexp versions.
*/
app.options(
  /.*/,
  cors(corsOptions)
);

/* ============================================
   MIDDLEWARE
============================================ */

/*
  Limit JSON request bodies to protect public API endpoints
  from unexpectedly large payloads.

  Multer-based image, video, CV, and document uploads are not
  affected by this JSON body limit.
*/
app.use(
  express.json({
    limit: "1mb",
    strict: true
  })
);

/*
  Support URL-encoded form bodies while limiting the total
  size and number of submitted parameters.
*/
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
    parameterLimit: 1000
  })
);

/* ============================================
   HEALTH
============================================ */
app.get("/", (req, res) => {
  res.send("AIFT Backend is running");
});

/* ============================================
   ROUTES
============================================ */
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/admin", adminStatsRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/employer-team", employerTeamRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/call-logs", callLogRoutes);
app.use("/api/notification-preferences", notificationPreferenceRoutes);
app.use("/api/message-templates", messageTemplateRoutes);
app.use("/api/conference-recordings", conferenceRecordingRoutes);
app.use("/api/conference-transcripts", conferenceTranscriptRoutes);
app.use("/api/chatbot-conversations", chatBotConversationRoutes);
app.use("/api/chat-assets", chatAssetRoutes);

/* ============================================
   NEW ADVANCED HIRING + BPO OPERATIONS SYSTEM
   Does NOT replace your old /api/tasks route
============================================ */
app.use("/api/work-tasks", workTaskRoutes);
app.use("/api/task-templates", taskTemplateRoutes);
app.use("/api/agent-sessions", agentSessionRoutes);

/* Optional aliases for frontend compatibility */
app.use("/api/agent-activity", agentSessionRoutes);
app.use("/api/agent-attendance", agentSessionRoutes);

app.use("/api/classes", classRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes);
/* ============================================
   CAREER HUB
============================================ */

/* ============================================
   OPPORTUNITIES
============================================ */

app.use(
  "/api/opportunities",
  opportunityRoutes
);


/* ============================================
   SCHOOL ↔ COMPANY PARTNERSHIPS
============================================ */

app.use(
  "/api/school-company-partnerships",
  schoolCompanyPartnershipRoutes
);


/* ============================================
   INTERNSHIP APPLICATIONS
============================================ */

app.use(
  "/api/internship-applications",
  internshipApplicationRoutes
);


/* ============================================
   CAMPUS RECRUITMENT CAMPAIGNS
============================================ */

app.use(
  "/api/campus-recruitment-campaigns",
  campusRecruitmentCampaignRoutes
);

/* ============================================
   SCHOLARSHIPS
============================================ */

app.use(
  "/api/scholarships",
  scholarshipRoutes
);


/* ============================================
   SCHOLARSHIP APPLICATIONS
============================================ */

app.use(
  "/api/scholarship-applications",
  scholarshipApplicationRoutes
);


/* ============================================
   CAREER EVENTS
============================================ */

app.use(
  "/api/career-events",
  careerEventRoutes
);


/* ============================================
   CAREER EVENT REGISTRATIONS
============================================ */

app.use(
  "/api/career-event-registrations",
  careerEventRegistrationRoutes
);


/* ============================================
   STUDENT VENTURES
============================================ */

app.use(
  "/api/ventures",
  ventureRoutes
);

app.use(
  "/api/school-updates",
  schoolUpdateRoutes
);

app.use(
  "/api/attendance",
  attendanceRoutes
);

/*
  Analytics endpoints:

  POST /api/analytics/events
  GET  /api/analytics/school/:schoolId
*/
app.use("/api/analytics", analyticsRoutes);

app.use("/api/saved", savedRoutes);
app.use("/api/groups", groupRoutes);

app.use(
  "/api/class-modules",
  classModuleRoutes
);

app.use(
  "/api/class-lessons",
  classLessonRoutes
);

app.use(
  "/api/quizzes",
  quizRoutes
);

app.use(
  "/api/question-bank",
  questionBankRoutes
);

app.use(
  "/api/lesson-progress",
  lessonProgressRoutes
);

app.use(
  "/api/uploads",
  uploadRoutes
);

app.use(
  "/api/student-resources",
  studentResourceRoutes
);

app.use(
  "/api/certificates",
  certificateRoutes
);

app.use(
  "/api/student-portfolio",
  studentPortfolioRoutes
);


/* ============================================
   KABEZYA AI
============================================ */


/* ============================================
   STUDENT KABEZYA

   Existing Student AI system.

   This remains unchanged.
============================================ */

app.use(
  "/api/student-ai",
  studentAIRoutes
);


/* ============================================
   TEACHER KABEZYA

   Existing Teacher Studio AI system.

   IMPORTANT:
   Keep the existing /api/kabezya mount because
   teacherKabezya.js owns its /teacher routes.

   Existing endpoints include:

   POST
   /api/kabezya/teacher/assistant

   POST
   /api/kabezya/teacher/analyze-class

   POST
   /api/kabezya/teacher/analyze-student

   POST
   /api/kabezya/teacher/inspect-submission

   POST
   /api/kabezya/teacher/generate-quiz

   POST
   /api/kabezya/teacher/generate-assignment

   POST
   /api/kabezya/teacher/lesson-plan

   GET
   /api/kabezya/teacher/conversations

   POST
   /api/kabezya/teacher/conversations

   GET
   /api/kabezya/teacher/conversations/:conversationId
============================================ */

app.use(
  "/api/kabezya",
  teacherKabezyaRoutes
);


/* ============================================
   EMPLOYER KABEZYA

   Employer Kabezya is intentionally mounted
   separately because employerKabezya.js defines
   its routes from / directly.

   Final API paths:

   GET
   /api/kabezya/employer

   POST
   /api/kabezya/employer/assistant

   GET
   /api/kabezya/employer/conversations

   POST
   /api/kabezya/employer/conversations

   GET
   /api/kabezya/employer/conversations/:conversationId

   POST
   /api/kabezya/employer/conversations/:conversationId/messages

   PATCH
   /api/kabezya/employer/conversations/:conversationId/messages/:messageId

   DELETE
   /api/kabezya/employer/conversations/:conversationId
============================================ */

app.use(
  "/api/kabezya/employer",
  employerKabezyaRoutes
);


/* ============================================
   SUPPORT
============================================ */

app.use(
  "/api/support",
  supportRoutes
);


/* ============================================
   MEDIA
============================================ */

app.use(
  "/api/media",
  mediaRoutes
);


/* ============================================
   SOCKET.IO
============================================ */
const http = require("http");
const { Server } = require("socket.io");

const {
  schoolAnalyticsRoom
} = require(
  "./services/analyticsRealtimeService"
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:
      validateRequestOrigin,

    methods: [
      "GET",
      "POST"
    ],

    allowedHeaders: [
      "Accept",
      "Authorization",
      "Content-Type",
      "Origin",
      "X-Requested-With",
      "Cache-Control",
      "Pragma"
    ],

    credentials:
      true
  },

  /*
    Limit the size of one Socket.IO message to approximately
    one megabyte.
  */
  maxHttpBufferSize: 1e6,

  /*
    Heartbeat settings used to detect disconnected clients.
  */
  pingInterval: 25000,
  pingTimeout: 20000
});

const onlineUsers = new Map();


io.on("connection", socket => {
  console.log("User connected:", socket.id);


  /* ============================================
     AUTHENTICATED PRIVATE SOCKET ROOM
  ============================================ */

  socket.on(
    "join",
    async payload => {

      try {

        /* ========================================
           NORMALIZE CLIENT PAYLOAD
        ======================================== */

        const joinData =
          payload &&
          typeof payload === "object"
            ? payload
            : {
                userId: payload
              };


        /* ========================================
           GET AUTHENTICATION TOKEN

           Prefer the Socket.IO handshake token.

           joinData.token remains supported during
           frontend migration.
        ======================================== */

        const token =
          String(
            socket.handshake
              ?.auth
              ?.token ||
            joinData.token ||
            ""
          )
            .trim();


        if (!token) {

          console.warn(
            "Socket join rejected: missing token",
            {
              socketId:
                socket.id
            }
          );


          socket.emit(
            "socketAuthError",
            {
              message:
                "Authentication is required for realtime access."
            }
          );


          return;
        }


        /* ========================================
           VERIFY JWT
        ======================================== */

        let decoded;


        try {

          decoded =
            jwt.verify(
              token,
              process.env.JWT_SECRET
            );

        } catch (error) {

          console.warn(
            "Socket join rejected: invalid token",
            {
              socketId:
                socket.id,

              message:
                error.message
            }
          );


          socket.emit(
            "socketAuthError",
            {
              message:
                "Realtime authentication failed."
            }
          );


          return;
        }


        const authenticatedUserId =
          String(
            decoded?.id ||
            decoded?._id ||
            ""
          )
            .trim();


        if (!authenticatedUserId) {

          socket.emit(
            "socketAuthError",
            {
              message:
                "Realtime authentication is invalid."
            }
          );


          return;
        }


        /* ========================================
           LOAD AUTHORITATIVE USER

           IMPORTANT:
           Do not trust userId or role supplied by
           the browser.

           JWT + MongoDB determine the real user.
        ======================================== */

        const user =
          await User.findById(
            authenticatedUserId
          )
            .select(
              "_id role status isBlockedByEmployer"
            )
            .lean();


        if (!user) {

          socket.emit(
            "socketAuthError",
            {
              message:
                "Realtime user account was not found."
            }
          );


          return;
        }


        /* ========================================
           ACCOUNT ACCESS CHECKS

           Match middleware/auth.js behavior.
        ======================================== */

        if (
          user.status ===
          "suspended"
        ) {

          socket.emit(
            "socketAuthError",
            {
              message:
                "Account suspended."
            }
          );


          return;
        }


        if (
          user.isBlockedByEmployer ===
          true
        ) {

          socket.emit(
            "socketAuthError",
            {
              message:
                "Realtime access is restricted for this account."
            }
          );


          return;
        }


        /* ========================================
           AUTHORITATIVE SOCKET IDENTITY
        ======================================== */

        const userId =
          String(
            user._id
          );


        const userRole =
          String(
            user.role ||
            ""
          )
            .trim()
            .toLowerCase();


        socket.userId =
          userId;


        socket.userRole =
          userRole;


        socket.data.userId =
          userId;


        socket.data.userRole =
          userRole;


        /* ========================================
           PRIVATE USER ROOM

           Used by:
           - messages
           - notifications
           - calls
           - submissions
           - grading
           - realtime teacher updates
        ======================================== */

        socket.join(
          userId
        );


        /* ========================================
           SCHOOL ANALYTICS ROOM

           Preserve your existing behavior.

           Teachers and students do not join the
           school analytics room.
        ======================================== */

        if (
          userRole ===
            "school" ||
          userRole ===
            "admin"
        ) {

          socket.join(
            schoolAnalyticsRoom(
              userId
            )
          );

        }


        /* ========================================
           ONLINE PRESENCE
        ======================================== */

        onlineUsers.set(
          userId,
          {
            socketId:
              socket.id,

            lastSeen:
              new Date(),

            online:
              true
          }
        );


        io.emit(
          "userOnline",
          {
            userId,

            online:
              true
          }
        );


        /* ========================================
           CONFIRM SUCCESSFUL AUTHENTICATED JOIN

           Teacher Studio Part 19 can listen for
           this event.
        ======================================== */

        socket.emit(
          "socketReady",
          {
            userId,

            role:
              userRole
          }
        );


        console.log(
          "Authenticated socket joined:",
          {
            socketId:
              socket.id,

            userId,

            role:
              userRole
          }
        );

      } catch (error) {

        console.error(
          "Socket join failed:",
          {
            socketId:
              socket.id,

            message:
              error.message
          }
        );


        socket.emit(
          "socketAuthError",
          {
            message:
              "Realtime authentication could not be completed."
          }
        );

      }

    }
  );

  socket.on("typing", ({ to }) => {
    if (!to || !socket.userId) return;

    socket.to(String(to)).emit("typing", {
      from: socket.userId
    });
  });

  socket.on("stopTyping", ({ to }) => {
    if (!to || !socket.userId) return;

    socket.to(String(to)).emit("stopTyping", {
      from: socket.userId
    });
  });

  socket.on("messageDelivered", ({ messageId, to }) => {
    if (!messageId || !to || !socket.userId) return;

    io.to(String(to)).emit("messageDelivered", {
      messageId,
      by: socket.userId,
      deliveredAt: new Date()
    });
  });

  socket.on("messageSeen", ({ messageId, to }) => {
    if (!messageId || !to || !socket.userId) return;

    io.to(String(to)).emit("messageSeen", {
      messageId,
      by: socket.userId,
      seenAt: new Date()
    });
  });

socket.on("callUser", ({
  to,
  from,
  callerName,
  callerAvatar,
  callType,
  conversationId,
  meetingId,
  callId,
  offer
}) => {
  if (!to) return;

  io.to(String(to)).emit("incomingCall", {
    from: from || socket.userId,
    callerName: callerName || "AIFT User",
    callerAvatar: callerAvatar || "",
    callType: callType || "audio",
    conversationId,
    meetingId,
    callId,
    offer,
    startedAt: new Date()
  });
});

socket.on("acceptCall", ({ to, meetingId, callId, answer }) => {
  if (!to) return;

  io.to(String(to)).emit("callAccepted", {
    from: socket.userId,
    meetingId,
    callId,
    answer,
    acceptedAt: new Date()
  });
});

socket.on("declineCall", ({ to, meetingId, callId, reason }) => {
  if (!to) return;

  io.to(String(to)).emit("callDeclined", {
    from: socket.userId,
    meetingId,
    callId,
    reason: reason || "declined",
    declinedAt: new Date()
  });
});

socket.on("endCall", ({ to, meetingId, callId }) => {
  if (!to) return;

  io.to(String(to)).emit("callEnded", {
    from: socket.userId,
    meetingId,
    callId,
    endedAt: new Date()
  });
});

  /* ============================================
   MEDIA LIBRARY ROOM
============================================ */

socket.on(
  "joinMediaRoom",
  ({
    classId,
    schoolId
  } = {}) => {
    if (!socket.userId) {
      return;
    }

    const normalizedClassId =
      String(classId || "").trim();

    const normalizedSchoolId =
      String(schoolId || "").trim();

    if (normalizedClassId) {
      socket.join(
        `media:class:${normalizedClassId}`
      );
    }

    if (normalizedSchoolId) {
      socket.join(
        `media:school:${normalizedSchoolId}`
      );
    }
  }
);

socket.on(
  "leaveMediaRoom",
  ({
    classId,
    schoolId
  } = {}) => {
    const normalizedClassId =
      String(classId || "").trim();

    const normalizedSchoolId =
      String(schoolId || "").trim();

    if (normalizedClassId) {
      socket.leave(
        `media:class:${normalizedClassId}`
      );
    }

    if (normalizedSchoolId) {
      socket.leave(
        `media:school:${normalizedSchoolId}`
      );
    }
  }
);

  socket.on("joinMeetingRoom", ({ meetingId }) => {
    if (!meetingId || !socket.userId) return;

    const room = `meeting:${meetingId}`;

    socket.join(room);

    socket.to(room).emit("meetingParticipantJoined", {
      userId: socket.userId,
      meetingId,
      joinedAt: new Date()
    });
  });

  socket.on("leaveMeetingRoom", ({ meetingId }) => {
    if (!meetingId || !socket.userId) return;

    const room = `meeting:${meetingId}`;

    socket.leave(room);

    socket.to(room).emit("meetingParticipantLeft", {
      userId: socket.userId,
      meetingId,
      leftAt: new Date()
    });
  });

  socket.on("raiseHand", ({ meetingId, raised }) => {
    if (!meetingId || !socket.userId) return;

    socket.to(`meeting:${meetingId}`).emit("participantHandRaised", {
      userId: socket.userId,
      meetingId,
      raised: raised !== false,
      updatedAt: new Date()
    });
  });

  socket.on("screenShareStatus", ({ meetingId, sharing }) => {
    if (!meetingId || !socket.userId) return;

    socket.to(`meeting:${meetingId}`).emit("screenShareStatus", {
      userId: socket.userId,
      meetingId,
      sharing: !!sharing,
      updatedAt: new Date()
    });
  });

socket.on("webrtcOffer", ({ to, offer, meetingId, callId }) => {
  if (!to || !offer) return;

  io.to(String(to)).emit("webrtcOffer", {
    from: socket.userId,
    offer,
    meetingId,
    callId
  });
});

socket.on("webrtcAnswer", ({ to, answer, meetingId, callId }) => {
  if (!to || !answer) return;

  io.to(String(to)).emit("webrtcAnswer", {
    from: socket.userId,
    answer,
    meetingId,
    callId
  });
});

socket.on("webrtcIceCandidate", ({ to, candidate, meetingId, callId }) => {
  if (!to || !candidate) return;

  io.to(String(to)).emit("webrtcIceCandidate", {
    from: socket.userId,
    candidate,
    meetingId,
    callId
  });
});

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.userId) {
      /*
  Leave analytics room.

  Socket.IO removes all rooms automatically,
  but this keeps our own state explicit.
*/

if (
  socket.userRole === "school" ||
  socket.userRole === "admin"
) {

  socket.leave(

    schoolAnalyticsRoom(

      socket.userId

    )

  );

}
      onlineUsers.set(socket.userId, {
        socketId: socket.id,
        lastSeen: new Date(),
        online: false
      });

      io.emit("userOnline", {
        userId: socket.userId,
        online: false,
        lastSeen: new Date()
      });
    }
  });
});

app.set("io", io);

/* ============================================
   GLOBAL EXPRESS ERROR HANDLER
============================================ */

/*
  This must remain after all route declarations and before
  MongoDB connects and starts the HTTP server.
*/
app.use((error, req, res, next) => {
  console.error("Unhandled Express error:", {
    message: error.message,
    method: req.method,
    path: req.originalUrl,
    statusCode:
      error.statusCode ||
      error.status ||
      500
  });

  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number(
    error.statusCode ||
    error.status ||
    500
  );

  const isProduction =
    process.env.NODE_ENV === "production";

  let message =
    error.message ||
    "An unexpected server error occurred.";

  if (
    statusCode === 403 &&
    message.includes("CORS")
  ) {
    message =
      "This website is not permitted to access the AIFT API.";
  }

  if (
    isProduction &&
    statusCode >= 500
  ) {
    message =
      "An unexpected server error occurred.";
  }

  return res.status(statusCode).json({
    success: false,
    message
  });
});

/* ============================================
   DB
============================================ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(process.env.PORT || 5000, () => {
      console.log("Server started with Socket.io");
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
