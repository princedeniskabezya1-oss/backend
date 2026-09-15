const nodemailer = require("nodemailer");

const DEFAULT_SENDER = "support@aiftph.com";

function smtpPassword(){
  return String(process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD || "").replace(/\s+/g,"");
}

function mailConfigured(){
  return Boolean(String(process.env.SMTP_USER || DEFAULT_SENDER).trim() && smtpPassword());
}

function frontendUrl(){
  return String(process.env.FRONTEND_URL || "https://job-platform-frontend-nine.vercel.app").replace(/\/+$/,"");
}

function transporter({port=465,secure=true}={}){
  if(!mailConfigured()) return null;
  return nodemailer.createTransport({
    host:String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    port,
    secure,
    requireTLS:!secure,
    family:4,
    connectionTimeout:12000,
    greetingTimeout:10000,
    socketTimeout:20000,
    auth:{
      user:String(process.env.SMTP_USER || DEFAULT_SENDER).trim(),
      pass:smtpPassword()
    }
  });
}

async function sendMail({to,subject,title,message,buttonLabel,buttonUrl}){
  if(!mailConfigured()) return { sent:false, reason:"Email delivery is not configured" };
  const sender=String(process.env.EMAIL_FROM || process.env.SMTP_USER || DEFAULT_SENDER).trim();
  const mail={
    from:`AIFT Support <${sender}>`,
    to,
    subject,
    text:`${title}\n\n${message}\n\n${buttonUrl}\n\nIf you did not request this, you can ignore this email.`,
    html:`<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#172033"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e3e8ef;border-radius:18px;overflow:hidden"><div style="padding:22px 26px;background:#0a66c2;color:#fff;font-size:22px;font-weight:800">AIFT</div><div style="padding:28px"><h1 style="font-size:23px;margin:0 0 12px">${title}</h1><p style="font-size:15px;line-height:1.65;color:#526071">${message}</p><a href="${buttonUrl}" style="display:inline-block;margin-top:12px;padding:13px 20px;border-radius:10px;background:#0a66c2;color:#fff;text-decoration:none;font-weight:800">${buttonLabel}</a><p style="margin-top:24px;font-size:12px;line-height:1.5;color:#7b8794">This secure link expires soon. If you did not request it, you can ignore this email.</p></div></div></body></html>`
  };
  let lastError=null;
  const configuredPort=Number(process.env.SMTP_PORT);
  const configuredSecure=String(process.env.SMTP_SECURE || "").toLowerCase();
  const configs=Number.isInteger(configuredPort) && configuredPort > 0
    ? [{port:configuredPort,secure:configuredSecure ? configuredSecure === "true" : configuredPort === 465}]
    : [{port:465,secure:true},{port:587,secure:false}];
  for(const config of configs){
    try{
      const result=await transporter(config).sendMail(mail);
      if(Array.isArray(result.accepted)&&result.accepted.length) return {sent:true};
      lastError=new Error("SMTP did not accept the recipient");
    }catch(error){ lastError=error; }
  }
  throw lastError || new Error("Email delivery failed");
}

async function sendVerificationEmail(user,token){
  const url=`${frontendUrl()}/account-access.html?mode=verify&token=${encodeURIComponent(token)}`;
  return sendMail({
    to:user.email,
    subject:"Verify your AIFT email address",
    title:"Verify your email",
    message:`Hello ${user.name || "AIFT member"}, confirm that this email belongs to you before signing in. This verification link expires in 24 hours.`,
    buttonLabel:"Verify email",
    buttonUrl:url
  });
}

async function sendPasswordResetEmail(user,token){
  const url=`${frontendUrl()}/account-access.html?mode=reset&token=${encodeURIComponent(token)}`;
  return sendMail({
    to:user.email,
    subject:"Reset your AIFT password",
    title:"Reset your password",
    message:`Hello ${user.name || "AIFT member"}, a password reset was requested for your AIFT account. This link expires in one hour.`,
    buttonLabel:"Reset password",
    buttonUrl:url
  });
}

module.exports={mailConfigured,sendVerificationEmail,sendPasswordResetEmail};
