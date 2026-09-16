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
    html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#13213a;-webkit-text-size-adjust:100%;text-size-adjust:100%"><div style="display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${safeTitle} — secure AIFT account access.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff"><tr><td align="center" style="padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff"><tr><td style="padding:18px 22px;border-bottom:1px solid #e7edf4"><a href="${siteUrl}" style="text-decoration:none"><img src="${siteUrl}/images/aift-logo-header.png" width="120" alt="AIFT" style="display:block;width:120px;max-width:38%;height:auto;border:0"></a></td></tr><tr><td style="padding:28px 22px 16px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#edf6ff;color:#0868c9;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:.45px;text-transform:uppercase">Account security</div><h1 style="margin:16px 0 10px;font-size:23px;line-height:1.25;font-weight:700;color:#13213a">${safeTitle}</h1><p style="margin:0;color:#58677d;font-size:14px;line-height:1.65">${safeMessage}</p></td></tr><tr><td style="padding:8px 22px 28px"><a href="${safeButtonUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#086fce;color:#ffffff;text-decoration:none;font-size:14px;line-height:1.2;font-weight:700">${safeButtonLabel}</a></td></tr><tr><td style="padding:18px 22px;background:#f7f9fc;border-top:1px solid #e7edf4"><p style="margin:0 0 6px;color:#66758a;font-size:12px;line-height:1.55">This secure link expires soon. If you did not request this action, you can safely ignore this email.</p><p style="margin:0;color:#8a96a7;font-size:11px;line-height:1.5">Sent securely by AIFT Support · <a href="${siteUrl}" style="color:#086fce;text-decoration:none">aiftph.com</a></p></td></tr></table></td></tr></table></body></html>`
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
