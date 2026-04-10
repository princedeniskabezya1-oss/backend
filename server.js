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

const classRoutes = require("./routes/classes");
const projectRoutes = require("./routes/projects");
const assignmentRoutes = require("./routes/assignments");
const submissionRoutes = require("./routes/submissions");
const opportunityRoutes = require("./routes/opportunities");

const app = express();

/* ============================================
   CORS CONFIGURATION (FIXED FOR PREFLIGHT)
============================================ */
app.use(cors({
  origin: "*", // you can restrict later to your Vercel domain
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Explicitly handle preflight requests
app.options("*", cors());

/* ============================================
   MIDDLEWARES
============================================ */
app.use(express.json());

/* ============================================
   ROUTES
============================================ */
app.get("/", (req, res) => {
  res.send("Backend is running 🟢");
});

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/admin", adminStatsRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);

app.use("/api/classes", classRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/opportunities", opportunityRoutes);


/* ============================================
   DATABASE CONNECTION
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
    socket.join(userId);
    socket.userId = userId;
    console.log("User joined room:", userId);
  });

  socket.on("typing", ({ to }) => {
    socket.to(to).emit("typing");
  });

  socket.on("stopTyping", ({ to }) => {
    socket.to(to).emit("stopTyping");
  });

  // =========================
  // CALL SIGNALING
  // =========================

  socket.on("callUser", ({ to, from, callerName, callType }) => {
    io.to(to).emit("incomingCall", {
      from,
      callerName,
      callType
    });
  });

  socket.on("acceptCall", ({ to }) => {
    io.to(to).emit("callAccepted");
  });

  socket.on("declineCall", ({ to }) => {
    io.to(to).emit("callDeclined");
  });

  socket.on("endCall", ({ to }) => {
    io.to(to).emit("callEnded");
  });

  socket.on("webrtcOffer", ({ to, offer }) => {
    io.to(to).emit("webrtcOffer", { offer });
  });

  socket.on("webrtcAnswer", ({ to, answer }) => {
    io.to(to).emit("webrtcAnswer", { answer });
  });

  socket.on("webrtcIceCandidate", ({ to, candidate }) => {
    io.to(to).emit("webrtcIceCandidate", { candidate });
  });

});

app.set("io", io);

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
