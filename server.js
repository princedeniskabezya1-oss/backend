const messageRoutes = require("./routes/messages");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const jobsRoutes = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");
const adminStatsRoutes = require("./routes/adminStats");
const userRoutes = require("./routes/users"); // ✅ ADD THIS
const postRoutes = require("./routes/posts");
const notificationRoutes = require("./routes/notifications");

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


/* ============================================
   DATABASE CONNECTION
============================================ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log("Server started");
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
