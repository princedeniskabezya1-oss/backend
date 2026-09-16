const nodemailer = require("nodemailer");

const DEFAULT_SENDER = "support@aiftph.com";

function smtpPassword(){
  return String(process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD || "").replace(/\s+/g,"");
}

function resendApiKey(){
  return String(process.env.RESEND_API_KEY || smtpPassword()).replace(/\s+/g,"");
}

function useResendApi(){
  return String(process.env.SMTP_HOST || "").trim().toLowerCase() === "smtp.resend.com"
    || Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

function mailConfigured(){
  return Boolean(String(process.env.SMTP_USER || DEFAULT_SENDER).trim() && resendApiKey());
}

function frontendUrl(){
  return String(process.env.FRONTEND_URL || "https://aiftph.com").replace(/\/+$/,"");
}

function escapeHtml(value){
  return String(value || "").replace(/[&<>"']/g,(character)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[character]);
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
  const safeTitle=escapeHtml(title);
  const safeMessage=escapeHtml(message);
  const safeButtonLabel=escapeHtml(buttonLabel);
  const safeButtonUrl=escapeHtml(buttonUrl);
  const siteUrl=frontendUrl();
  const mail={
    from:`AIFT Support <${sender}>`,
    to,
    subject,
    text:`${title}\n\n${message}\n\n${buttonUrl}\n\nIf you did not request this, you can ignore this email.`,
    html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,Helvetica,sans-serif;color:#13213a"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${safeTitle} — secure AIFT account access.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f6fb"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid #dce5f0;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(20,51,91,.08)"><tr><td style="padding:24px 28px;border-bottom:1px solid #e8eef5"><a href="${siteUrl}" style="text-decoration:none"><img src="${siteUrl}/images/aift-logo-header.png" width="150" alt="AIFT" style="display:block;width:150px;max-width:45%;height:auto;border:0"></a></td></tr><tr><td style="padding:36px 28px 20px"><div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#eaf4ff;color:#0868c9;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Account security</div><h1 style="margin:18px 0 12px;font-size:29px;line-height:1.2;color:#13213a">${safeTitle}</h1><p style="margin:0;color:#53627a;font-size:16px;line-height:1.7">${safeMessage}</p></td></tr><tr><td style="padding:8px 28px 30px"><a href="${safeButtonUrl}" style="display:inline-block;padding:15px 24px;border-radius:12px;background:#086fce;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">${safeButtonLabel}</a></td></tr><tr><td style="padding:22px 28px;background:#f8fafc;border-top:1px solid #e8eef5"><p style="margin:0 0 8px;color:#5f6f85;font-size:13px;line-height:1.6">This secure link expires soon. If you did not request this action, you can safely ignore this email.</p><p style="margin:0;color:#8793a5;font-size:12px;line-height:1.5">Sent securely by AIFT Support · <a href="${siteUrl}" style="color:#086fce;text-decoration:none">aiftph.com</a></p></td></tr></table></td></tr></table></body></html>`
  };
  if(useResendApi()){
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        Authorization:`Bearer ${resendApiKey()}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        from:mail.from,
        to:[mail.to],
        subject:mail.subject,
        text:mail.text,
        html:mail.html
      })
    });
    if(response.ok) return {sent:true};
    const raw=String(await response.text()).slice(0,1000);
    let detail=raw.slice(0,240);
    try{
      const payload=JSON.parse(raw);
      detail=String(payload.message || payload.name || detail).slice(0,240);
    }catch(_error){}
    throw new Error(`Resend API rejected email (${response.status})${detail ? `: ${detail}` : ""}`);
  }
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
