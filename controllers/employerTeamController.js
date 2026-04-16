const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Notification = require("../models/Notification");
const cloudinary = require("../config/cloudinary");

function normalizeEmployerContext(user) {
  if (!user) return null;
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

async function ensureEmployerAccess(req, targetUserId = null) {
  const actor = await User.findById(req.user.id);
  if (!actor) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const companyId = normalizeEmployerContext(actor);
  if (!companyId) {
    const err = new Error("Access denied");
    err.status = 403;
    throw err;
  }

  if (targetUserId) {
    const target = await User.findById(targetUserId);
    if (!target) {
      const err = new Error("Team member not found");
      err.status = 404;
      throw err;
    }

    if (String(target.companyId) !== String(companyId)) {
      const err = new Error("You can only manage your own company team members");
      err.status = 403;
      throw err;
    }

    return { actor, target, companyId };
  }

  return { actor, companyId };
}

exports.getEmployerTeam = async (req, res) => {
  try {
    const { companyId } = await ensureEmployerAccess(req);

    const members = await User.find({ companyId })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      team: members
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Failed to load employer team" });
  }
};

exports.createEmployerTeamMember = async (req, res) => {
  try {
    const { actor, companyId } = await ensureEmployerAccess(req);
    const {
      name,
      email,
      password,
      role = "agent",
      teamRole = "viewer",
      department = "",
      permissions = []
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const member = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role,
      companyId,
      createdByEmployer: actor._id,
      teamRole,
      department,
      permissions: Array.isArray(permissions) ? permissions : []
    });

    res.status(201).json({
      message: "Team member created successfully",
      member: await User.findById(member._id).select("-password")
    });
  } catch (err) {
    console.error("CREATE EMPLOYER TEAM MEMBER ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed to create team member" });
  }
};

exports.updateEmployerTeamMember = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);

    const allowed = ["name", "email", "teamRole", "department", "permissions"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        target[field] = req.body[field];
      }
    });

    if (req.body.email) {
      target.email = String(req.body.email).toLowerCase().trim();
    }

    await target.save();

    res.json({
      message: "Team member updated successfully",
      member: await User.findById(target._id).select("-password")
    });
  } catch (err) {
    console.error("UPDATE EMPLOYER TEAM MEMBER ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed to update team member" });
  }
};

exports.updateEmployerTeamPhoto = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);

    if (!req.file) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "aift_team_profiles",
          resource_type: "auto"
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      ).end(req.file.buffer);
    });

    target.profileImage = uploadResult.secure_url;
    await target.save();

    res.json({
      message: "Profile photo updated successfully",
      profileImage: target.profileImage,
      member: await User.findById(target._id).select("-password")
    });
  } catch (err) {
    console.error("UPDATE EMPLOYER TEAM PHOTO ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed to update photo" });
  }
};

exports.resetEmployerTeamPassword = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).trim().length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    target.password = await bcrypt.hash(String(newPassword).trim(), 10);
    await target.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("RESET EMPLOYER TEAM PASSWORD ERROR:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed to reset password" });
  }
};

exports.blockEmployerTeamMember = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);
    target.isBlockedByEmployer = true;
    await target.save();

    res.json({ message: "Team member blocked successfully" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Failed to block team member" });
  }
};

exports.unblockEmployerTeamMember = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);
    target.isBlockedByEmployer = false;
    await target.save();

    res.json({ message: "Team member unblocked successfully" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Failed to unblock team member" });
  }
};

exports.deleteEmployerTeamMember = async (req, res) => {
  try {
    const { target } = await ensureEmployerAccess(req, req.params.id);
    await User.findByIdAndDelete(target._id);

    res.json({ message: "Team member deleted successfully" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Failed to delete team member" });
  }
};

exports.getEmployerPublicProfile = async (req, res) => {
  try {
    const employer = await User.findById(req.params.id)
      .select("-password")
      .lean();

    if (!employer) {
      return res.status(404).json({ message: "Employer not found" });
    }

    const team = await User.find({
      companyId: employer._id,
      isBlockedByEmployer: false
    })
      .select("name profileImage headline teamRole department")
      .lean();

    res.json({
      employer,
      team
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load employer public profile" });
  }
};