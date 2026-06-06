const messageRoutes = require("./routes/messages");
const meetingRoutes = require("./routes/meetings");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
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
const assignmentRoutes = require("./routes/assignments");
const submissionRoutes = require("./routes/submissions");
const opportunityRoutes = require("./routes/opportunities");
const schoolCompanyPartnershipRoutes = require("./routes/schoolCompanyPartnerships");
const internshipApplicationRoutes = require("./routes/internshipApplications");
const schoolUpdateRoutes = require("./routes/schoolUpdates");
const attendanceRoutes = require("./routes/attendance");
const savedRoutes = require("./routes/saved");
const groupRoutes = require("./routes/groups");
const conversationRoutes = require("./routes/conversations");
const meetingRoutes = require("./routes/meetings");
const callLogRoutes = require("./routes/callLogs");
const notificationPreferenceRoutes = require("./routes/notificationPreferences");
const messageTemplateRoutes = require("./routes/messageTemplates");
const conferenceRecordingRoutes = require("./routes/conferenceRecordings");
const conferenceTranscriptRoutes = require("./routes/conferenceTranscripts");
const chatBotConversationRoutes = require("./routes/chatBotConversations");

const classModuleRoutes = require("./routes/classModules");
const classLessonRoutes = require("./routes/classLessons");
const quizRoutes = require("./routes/quizzes");
const lessonProgressRoutes = require("./routes/lessonProgress");

const app = express();

/* ============================================
   CORS
============================================ */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

/* ============================================
   MIDDLEWARE
============================================ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/meetings", meetingRoutes);
app.use("/api/call-logs", callLogRoutes);
app.use("/api/notification-preferences", notificationPreferenceRoutes);
app.use("/api/message-templates", messageTemplateRoutes);
app.use("/api/conference-recordings", conferenceRecordingRoutes);
app.use("/api/conference-transcripts", conferenceTranscriptRoutes);
app.use("/api/chatbot-conversations", chatBotConversationRoutes);

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
app.use("/api/opportunities", opportunityRoutes);
app.use("/api/school-company-partnerships", schoolCompanyPartnershipRoutes);
app.use("/api/internship-applications", internshipApplicationRoutes);
app.use("/api/school-updates", schoolUpdateRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/groups", groupRoutes);

app.use("/api/class-modules", classModuleRoutes);
app.use("/api/class-lessons", classLessonRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/lesson-progress", lessonProgressRoutes);
/* ============================================
   SOCKET.IO
============================================ */
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const onlineUsers = new Map();

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("join", userId => {
    if (!userId) return;

    const id = String(userId);

    socket.join(id);
    socket.userId = id;

    onlineUsers.set(id, {
      socketId: socket.id,
      lastSeen: new Date(),
      online: true
    });

    io.emit("userOnline", {
      userId: id,
      online: true
    });

    console.log("User joined room:", id);
  });

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

  socket.on("callUser", ({ to, from, callerName, callType, conversationId, meetingId }) => {
    if (!to) return;

    io.to(String(to)).emit("incomingCall", {
      from: from || socket.userId,
      callerName: callerName || "AIFT User",
      callType: callType || "audio",
      conversationId,
      meetingId,
      startedAt: new Date()
    });
  });

  socket.on("acceptCall", ({ to, meetingId }) => {
    if (!to) return;

    io.to(String(to)).emit("callAccepted", {
      from: socket.userId,
      meetingId,
      acceptedAt: new Date()
    });
  });

  socket.on("declineCall", ({ to, meetingId }) => {
    if (!to) return;

    io.to(String(to)).emit("callDeclined", {
      from: socket.userId,
      meetingId,
      declinedAt: new Date()
    });
  });

  socket.on("endCall", ({ to, meetingId }) => {
    if (!to) return;

    io.to(String(to)).emit("callEnded", {
      from: socket.userId,
      meetingId,
      endedAt: new Date()
    });
  });

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

  socket.on("webrtcOffer", ({ to, offer, meetingId }) => {
    if (!to || !offer) return;

    io.to(String(to)).emit("webrtcOffer", {
      from: socket.userId,
      offer,
      meetingId
    });
  });

  socket.on("webrtcAnswer", ({ to, answer, meetingId }) => {
    if (!to || !answer) return;

    io.to(String(to)).emit("webrtcAnswer", {
      from: socket.userId,
      answer,
      meetingId
    });
  });

  socket.on("webrtcIceCandidate", ({ to, candidate, meetingId }) => {
    if (!to || !candidate) return;

    io.to(String(to)).emit("webrtcIceCandidate", {
      from: socket.userId,
      candidate,
      meetingId
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.userId) {
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
