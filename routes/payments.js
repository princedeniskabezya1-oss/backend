"use strict";

const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const Payment = require("../models/Payment");
const Class = require("../models/Class");
const Venture = require("../models/Venture");

const router = express.Router();
const PAYPAL_BASE = process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const liveMode = () => process.env.PAYPAL_MODE === "live";
const configured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && (!liveMode() || process.env.PAYPAL_WEBHOOK_ID));
const money = value => Number(Number(value || 0).toFixed(2));

async function accessToken(){
  if(!configured()) throw Object.assign(new Error("Secure payments are not configured yet."), { status: 503 });
  const authValue = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, { method:"POST", headers:{ Authorization:`Basic ${authValue}`, "Content-Type":"application/x-www-form-urlencoded" }, body:"grant_type=client_credentials" });
  const data = await response.json().catch(() => ({}));
  if(!response.ok || !data.access_token) throw Object.assign(new Error("PayPal is temporarily unavailable."), { status:502 });
  return data.access_token;
}

async function quote(body){
  const type = String(body?.type || "").trim();
  const id = String(body?.id || "").trim();
  if(type === "travel") return { type, productId:null, name:"AIFT four-month preparation program", amount:2500, currency:"USD", returnUrl:"travel-guide.html#aift-package" };
  if(!mongoose.Types.ObjectId.isValid(id)) throw Object.assign(new Error("A valid item is required."), { status:400 });
  if(type === "course"){
    const course = await Class.findOne({ _id:id, published:true, status:{ $ne:"archived" } }).select("title pricingSettings publishingSettings enrollmentSettings studentIds");
    if(!course || course.publishingSettings?.visibility !== "public") throw Object.assign(new Error("This course is not available."), { status:404 });
    const amount = money(course.pricingSettings?.amount);
    if(course.pricingSettings?.accessType !== "paid" || amount <= 0) throw Object.assign(new Error("This course does not require payment."), { status:400 });
    const enrollment=course.enrollmentSettings || {},now=new Date();
    if(enrollment.accessType !== "public") throw Object.assign(new Error("This course requires an invitation."), {status:403});
    if(enrollment.enrollmentOpensAt && new Date(enrollment.enrollmentOpensAt)>now) throw Object.assign(new Error("Enrollment has not opened yet."), {status:403});
    if(enrollment.enrollmentClosesAt && new Date(enrollment.enrollmentClosesAt)<=now) throw Object.assign(new Error("Enrollment is closed."), {status:403});
    if(Number(enrollment.maximumStudents||0)>0 && course.studentIds.length>=Number(enrollment.maximumStudents)) throw Object.assign(new Error("This course is currently full."), {status:409});
    return { type, productId:course._id, name:course.title, amount, currency:String(course.pricingSettings?.currency || "PHP").toUpperCase(), returnUrl:`class-view.html?classId=${course._id}&from=learning`, course };
  }
  if(type === "venture_contribution"){
    const venture = await Venture.findById(id).select("title status visibility fundingGoal fundingRaised currency ownerId fundingTypes");
    if(!venture || venture.status !== "active" || venture.visibility !== "public") throw Object.assign(new Error("This venture is not accepting contributions."), { status:404 });
    const amount = money(body?.amount);
    if(amount < 1 || amount > 1000000) throw Object.assign(new Error("Enter a contribution between 1 and 1,000,000."), { status:400 });
    return { type, productId:venture._id, name:`Contribution to ${venture.title}`, amount, currency:String(venture.currency || "PHP").toUpperCase(), returnUrl:`venture.html?id=${venture._id}`, venture };
  }
  throw Object.assign(new Error("Unsupported payment type."), { status:400 });
}

async function completePayment(payment, capture, method="paypal"){
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      const current=await Payment.findById(payment._id).session(session);
      if(!current || current.metadata?.fulfilledAt) return;
      current.status="paid";
      current.method=method;
      current.transactionId=capture.id;
      current.providerCaptureId=capture.id;
      current.paidAt=new Date();
      current.metadata={...(current.metadata||{}),fulfilledAt:new Date()};
      await current.save({session});
      if(current.productType === "course") await Class.updateOne({_id:current.productId},{$addToSet:{studentIds:current.userId}},{session});
      if(current.productType === "venture_contribution") await Venture.updateOne({_id:current.productId},{$inc:{fundingRaised:current.amount}},{session});
    });
  }finally{ await session.endSession(); }
}

router.get("/config", (req,res) => res.json({ enabled:configured(), clientId:configured()?process.env.PAYPAL_CLIENT_ID:"", mode:liveMode()?"live":"sandbox" }));

router.get("/venture/:ventureId/contributors", async(req,res) => {
  try{
    const ventureId=String(req.params.ventureId||"").trim();
    if(!mongoose.Types.ObjectId.isValid(ventureId)){
      return res.status(400).json({message:"Invalid venture ID."});
    }

    const venture=await Venture.findById(ventureId)
      .select("_id title status visibility fundingRaised currency")
      .lean();

    if(!venture || venture.visibility!=="public" || !["active","funded","closed"].includes(venture.status)){
      return res.status(404).json({message:"Venture not found."});
    }

    const contributionQuery={
      productType:"venture_contribution",
      productId:venture._id,
      status:"paid"
    };

    const [payments,totalCount]=await Promise.all([
      Payment.find(contributionQuery)
        .populate("userId","name companyName schoolName profileImage logo")
        .select("userId amount currency paidAt createdAt metadata")
        .sort({paidAt:-1,createdAt:-1})
        .limit(250)
        .lean(),
      Payment.countDocuments(contributionQuery)
    ]);

    const contributors=payments.map(payment=>{
      const anonymous=payment.metadata?.publicContributor===false;
      const user=payment.userId||{};
      const displayName=anonymous
        ? "Anonymous"
        : String(user.companyName||user.schoolName||user.name||"AIFT Supporter").trim();

      return {
        id:String(payment._id),
        displayName,
        profileImage:anonymous ? "" : String(user.profileImage||user.logo||""),
        anonymous,
        amount:money(payment.amount),
        currency:String(payment.currency||venture.currency||"PHP").toUpperCase(),
        paidAt:payment.paidAt||payment.createdAt
      };
    });

    return res.json({
      ventureId:String(venture._id),
      count:totalCount,
      fundingRaised:money(venture.fundingRaised),
      currency:String(venture.currency||"PHP").toUpperCase(),
      contributors
    });
  }catch(error){
    console.error("LOAD VENTURE CONTRIBUTORS ERROR:",error.message);
    return res.status(500).json({message:"Unable to load venture contributors."});
  }
});

router.get("/mine", auth, async(req,res) => {
  try{
    const payments=await Payment.find({userId:req.user._id})
      .select("productType productName amount currency method status transactionId providerOrderId paidAt createdAt")
      .sort({createdAt:-1})
      .limit(200)
      .lean();
    res.json({payments});
  }catch(error){
    console.error("LOAD USER PAYMENTS ERROR:",error.message);
    res.status(500).json({message:"Unable to load your billing history."});
  }
});

router.post("/quote", auth, async(req,res) => { try{ const q=await quote(req.body); res.json({ type:q.type, id:q.productId, name:q.name, amount:q.amount, currency:q.currency, returnUrl:q.returnUrl, notice:q.type === "venture_contribution" ? "This is a voluntary contribution. It does not provide shares, ownership, profit, or a guaranteed return." : "" }); }catch(error){ res.status(error.status||500).json({message:error.message||"Unable to prepare payment."}); } });

router.post("/orders", auth, async(req,res) => {
  try{
    const q=await quote(req.body);
    if(q.type === "course" && q.course.studentIds.map(String).includes(String(req.user._id))) return res.status(409).json({message:"You are already enrolled in this course."});
    const token=await accessToken();
    const requestId=crypto.randomUUID();
    const response=await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json", "PayPal-Request-Id":requestId }, body:JSON.stringify({ intent:"CAPTURE", purchase_units:[{ reference_id:requestId, description:q.name.slice(0,127), custom_id:`${q.type}:${q.productId||"travel"}:${req.user._id}`, amount:{ currency_code:q.currency, value:q.amount.toFixed(2) } }], application_context:{ shipping_preference:"NO_SHIPPING", user_action:"PAY_NOW" } }) });
    const order=await response.json().catch(()=>({}));
    if(!response.ok || !order.id) return res.status(502).json({message:order.message||"PayPal could not create this order."});
    const paymentMetadata={
      returnUrl:q.returnUrl
    };

    if(q.type==="venture_contribution"){
      paymentMetadata.publicContributor=req.body?.anonymous!==true;
    }

    await Payment.create({
      userId:req.user._id,
      productType:q.type,
      productId:q.productId,
      productName:q.name,
      amount:q.amount,
      currency:q.currency,
      method:"paypal",
      status:"pending",
      providerOrderId:order.id,
      metadata:paymentMetadata
    });
    res.status(201).json({ id:order.id });
  }catch(error){ console.error("CREATE PAYMENT ORDER ERROR:",error.message); res.status(error.status||500).json({message:error.message||"Unable to start payment."}); }
});

router.post("/orders/:orderId/capture", auth, async(req,res) => {
  try{
    const payment=await Payment.findOne({providerOrderId:req.params.orderId,userId:req.user._id});
    if(!payment) return res.status(404).json({message:"Payment order not found."});
    if(payment.status === "paid") return res.json({status:"COMPLETED",returnUrl:payment.metadata?.returnUrl||"home.html"});
    const token=await accessToken();
    const response=await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(payment.providerOrderId)}/capture`, {method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","PayPal-Request-Id":`capture-${payment._id}`}});
    const result=await response.json().catch(()=>({}));
    const capture=result.purchase_units?.[0]?.payments?.captures?.[0];
    if(!response.ok || result.status !== "COMPLETED" || capture?.status !== "COMPLETED") return res.status(422).json({message:result.message||"Payment was not completed."});
    if(money(capture.amount?.value)!==money(payment.amount) || capture.amount?.currency_code!==payment.currency) return res.status(409).json({message:"Payment verification failed."});
    await completePayment(payment,capture,result.payment_source?.card?"card":"paypal");
    res.json({status:"COMPLETED",returnUrl:payment.metadata?.returnUrl||"home.html"});
  }catch(error){ console.error("CAPTURE PAYMENT ERROR:",error.message); res.status(error.status||500).json({message:error.message||"Unable to confirm payment."}); }
});

router.post("/webhooks/paypal", async(req,res) => {
  try{
    if(!configured() || !process.env.PAYPAL_WEBHOOK_ID) return res.status(503).json({message:"PayPal webhook is not configured."});
    const token=await accessToken();
    const verification=await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({auth_algo:req.get("paypal-auth-algo"),cert_url:req.get("paypal-cert-url"),transmission_id:req.get("paypal-transmission-id"),transmission_sig:req.get("paypal-transmission-sig"),transmission_time:req.get("paypal-transmission-time"),webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:req.body})});
    const verified=await verification.json().catch(()=>({}));
    if(!verification.ok || verified.verification_status!=="SUCCESS") return res.status(400).json({message:"Invalid PayPal webhook."});
    if(req.body?.event_type==="PAYMENT.CAPTURE.COMPLETED"){
      const capture=req.body.resource||{},orderId=capture.supplementary_data?.related_ids?.order_id;
      const payment=orderId?await Payment.findOne({providerOrderId:orderId}):null;
      if(payment && money(capture.amount?.value)===money(payment.amount) && capture.amount?.currency_code===payment.currency) await completePayment(payment,capture,capture.payment_source?.card?"card":"paypal");
    }
    res.sendStatus(200);
  }catch(error){console.error("PAYPAL WEBHOOK ERROR:",error.message);res.sendStatus(500);}
});

router.get("/", auth, adminOnly, async(req,res) => res.json({payments:await Payment.find().populate("userId","name email").sort({createdAt:-1}).limit(500).lean()}));

module.exports = router;
