const crypto = require("crypto");
const SecurityEvent = require("../models/SecurityEvent");
const { sendSecurityAlertEmail } = require("./authEmailService");

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const recentAlerts = new Map();

function clientIp(req){
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.ip || req?.socket?.remoteAddress || "").trim() || null;
}

function maskIp(value){
  const ip = String(value || "").replace(/^::ffff:/, "");
  if(!ip) return null;
  if(ip.includes(":")) return `${ip.split(":").slice(0,4).join(":")}:*`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : "masked";
}

function fingerprintIp(value){
  if(!value) return null;
  const secret = String(process.env.SECURITY_LOG_SECRET || process.env.JWT_SECRET || "");
  if(!secret) return null;
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

function safeMetadata(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for(const [key, entry] of Object.entries(value).slice(0, 12)){
    if(!/^[a-zA-Z0-9_-]{1,50}$/.test(key)) continue;
    if(typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"){
      result[key] = String(entry).slice(0, 240);
    }
  }
  return result;
}

async function reportSecurityEvent({ req, type, severity="medium", outcome="blocked", actorUserId=null, metadata={} }){
  try{
    const rawIp = clientIp(req);
    const event = await SecurityEvent.create({
      type: String(type || "unknown_security_event").slice(0,80),
      severity,
      outcome,
      actorUserId: actorUserId || req?.user?._id || req?.user?.id || null,
      ipFingerprint: fingerprintIp(rawIp),
      maskedIp: maskIp(rawIp),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0,500) || null,
      method: String(req?.method || "").slice(0,12) || null,
      path: String(req?.originalUrl || req?.path || "").slice(0,300) || null,
      requestId: String(req?.securityRequestId || "").slice(0,100) || null,
      metadata: safeMetadata(metadata),
      expiresAt: new Date(Date.now() + RETENTION_MS)
    });

    if(severity === "high" || severity === "critical"){
      const alertKey = `${event.type}:${event.ipFingerprint || event.maskedIp || "unknown"}`;
      const lastAlert = recentAlerts.get(alertKey) || 0;
      if(Date.now() - lastAlert >= ALERT_COOLDOWN_MS){
        recentAlerts.set(alertKey, Date.now());
        await sendSecurityAlertEmail({
          type: event.type,
          severity: event.severity,
          time: event.createdAt,
          maskedIp: event.maskedIp,
          method: event.method,
          path: event.path,
          requestId: event.requestId
        });
      }
    }
    return event;
  }catch(error){
    console.error("SECURITY EVENT RECORD ERROR:", error.message);
    return null;
  }
}

module.exports = { reportSecurityEvent, maskIp, fingerprintIp };
