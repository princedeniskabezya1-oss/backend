const messageRoutes = require("./routes/messages");
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
const schoolUpdateRoutes = require("./routes/schoolUpdates");
const attendanceRoutes = require("./routes/attendance");

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
  res.send("Backend is running 🟢");
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
app.use("/api/notifications", notificationRoutes);
app.use("/api/employer-team", employerTeamRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invites", inviteRoutes);

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
app.use("/api/school-updates", schoolUpdateRoutes);
app.use("/api/attendance", attendanceRoutes);

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

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("join", userId => {
    socket.join(String(userId));
    socket.userId = String(userId);
    console.log("User joined room:", userId);
  });

  socket.on("typing", ({ to }) => {
    socket.to(String(to)).emit("typing");
  });

  socket.on("stopTyping", ({ to }) => {
    socket.to(String(to)).emit("stopTyping");
  });

  socket.on("callUser", ({ to, from, callerName, callType }) => {
    io.to(String(to)).emit("incomingCall", {
      from,
      callerName,
      callType
    });
  });

  socket.on("acceptCall", ({ to }) => {
    io.to(String(to)).emit("callAccepted");
  });

  socket.on("declineCall", ({ to }) => {
    io.to(String(to)).emit("callDeclined");
  });

  socket.on("endCall", ({ to }) => {
    io.to(String(to)).emit("callEnded");
  });

  socket.on("webrtcOffer", ({ to, offer }) => {
    io.to(String(to)).emit("webrtcOffer", { offer });
  });

  socket.on("webrtcAnswer", ({ to, answer }) => {
    io.to(String(to)).emit("webrtcAnswer", { answer });
  });

  socket.on("webrtcIceCandidate", ({ to, candidate }) => {
    io.to(String(to)).emit("webrtcIceCandidate", { candidate });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
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
