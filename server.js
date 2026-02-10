const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const applicationRoutes = require("./routes/applications");

const app = express();
const jobsRoutes = require("./routes/jobs");

// Middlewares
app.use(cors());
app.use(express.json());
app.use("/api/jobs", jobsRoutes);


// Test route (to check if backend works)
app.get("/", (req, res) => {
  res.send("Backend is running 🟢");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationRoutes);


// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log("Server started");
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
