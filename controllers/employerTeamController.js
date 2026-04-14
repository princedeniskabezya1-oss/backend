const bcrypt = require("bcryptjs");
const User = require("../models/User");

const ALLOWED_TEAM_ROLES = [
  "owner",
  "manager",
  "talent_acquisition",
  "recruiter",
  "coordinator",
  "viewer"
];

const ALLOWED_PERMISSIONS = [
  "view_dashboard",
  "create_jobs",
  "edit_jobs",
  "view_applicants",
  "move_pipeline",
  "message_candidates",
  "post_company_updates",
  "manage_team"
];

function normalizePermissions(permissions = []) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((p) => ALLOWED_PERMISSIONS.includes(p));
}

function canManageTeam(user) {
  if (!user) return false;
  if (user.role !== "employer") return false;

  // Main employer account can always manage its own company team
  if (!user.companyId) return true;

  if (user.teamRole === "owner" || user.teamRole === "manager") return true;

  if (Array.isArray(user.permissions) && user.permissions.includes("manage_team")) {
    return true;
  }

  return false;
}

function getCompanyId(user) {
  return user.companyId || user._id;
}

exports.getEmployerTeam = async (req, res) => {
  try {
    if (!canManageTeam(req.user)) {
      return res.status(403).json({ message: "Not allowed to view employer team." });
    }

    const companyId = getCompanyId(req.user);

    const team = await User.find({
      companyId
    }).select("-password").sort({ createdAt: -1 });

    res.json(team);

  } catch (err) {
    console.error("getEmployerTeam error:", err);
    res.status(500).json({ message: "Failed to load employer team." });
  }
};

exports.createEmployerTeamMember = async (req, res) => {
  try {
    if (!canManageTeam(req.user)) {
      return res.status(403).json({ message: "Not allowed to create team members." });
    }

    const {
      name,
      email,
      password,
      role,
      teamRole,
      department,
      permissions
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim()
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists." });
    }

    const normalizedTeamRole = ALLOWED_TEAM_ROLES.includes(teamRole)
      ? teamRole
      : "viewer";

    const normalizedPermissions = normalizePermissions(permissions);
    const hashedPassword = await bcrypt.hash(password, 10);
    const companyId = getCompanyId(req.user);

    const member = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role === "agent" ? "agent" : "employer",
      status: "active",
      companyId,
      teamRole: normalizedTeamRole,
      permissions: normalizedPermissions,
      department: department?.trim() || null,
      createdByEmployer: req.user._id,
      isBlockedByEmployer: false,
      companyName: req.user.companyName || req.user.name || null
    });

    const safeMember = await User.findById(member._id).select("-password");
    res.status(201).json(safeMember);

  } catch (err) {
    console.error("createEmployerTeamMember error:", err);
    res.status(500).json({ message: "Failed to create team member." });
  }
};

exports.updateEmployerTeamMember = async (req, res) => {
  try {
    if (!canManageTeam(req.user)) {
      return res.status(403).json({ message: "Not allowed to update team members." });
    }

    const { id } = req.params;
    const { teamRole, permissions, department, name } = req.body;

    const companyId = getCompanyId(req.user);

    const member = await User.findOne({
      _id: id,
      companyId
    });

    if (!member) {
      return res.status(404).json({ message: "Team member not found." });
    }

    if (teamRole) {
      if (!ALLOWED_TEAM_ROLES.includes(teamRole)) {
        return res.status(400).json({ message: "Invalid team role." });
      }
      member.teamRole = teamRole;
    }

    if (permissions) {
      member.permissions = normalizePermissions(permissions);
    }

    if (typeof department === "string") {
      member.department = department.trim() || null;
    }

    if (typeof name === "string" && name.trim()) {
      member.name = name.trim();
    }

    await member.save();

    const safeMember = await User.findById(member._id).select("-password");
    res.json(safeMember);

  } catch (err) {
    console.error("updateEmployerTeamMember error:", err);
    res.status(500).json({ message: "Failed to update team member." });
  }
};

exports.blockEmployerTeamMember = async (req, res) => {
  try {
    if (!canManageTeam(req.user)) {
      return res.status(403).json({ message: "Not allowed to block team members." });
    }

    const { id } = req.params;
    const companyId = getCompanyId(req.user);

    const member = await User.findOne({
      _id: id,
      companyId
    });

    if (!member) {
      return res.status(404).json({ message: "Team member not found." });
    }

    member.isBlockedByEmployer = true;
    await member.save();

    const safeMember = await User.findById(member._id).select("-password");
    res.json(safeMember);

  } catch (err) {
    console.error("blockEmployerTeamMember error:", err);
    res.status(500).json({ message: "Failed to block team member." });
  }
};

exports.unblockEmployerTeamMember = async (req, res) => {
  try {
    if (!canManageTeam(req.user)) {
      return res.status(403).json({ message: "Not allowed to unblock team members." });
    }

    const { id } = req.params;
    const companyId = getCompanyId(req.user);

    const member = await User.findOne({
      _id: id,
      companyId
    });

    if (!member) {
      return res.status(404).json({ message: "Team member not found." });
    }

    member.isBlockedByEmployer = false;
    await member.save();

    const safeMember = await User.findById(member._id).select("-password");
    res.json(safeMember);

  } catch (err) {
    console.error("unblockEmployerTeamMember error:", err);
    res.status(500).json({ message: "Failed to unblock team member." });
  }
};