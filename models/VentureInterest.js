const mongoose = require("mongoose");


/* =========================================================
   AIFT VENTURE INTEREST

   Records relationships between an AIFT user and a Venture.

   Examples:
   - save
   - follow
   - grant support
   - sponsorship interest
   - mentorship
   - pilot interest
   - investment interest

   IMPORTANT:
   "investment" here means interest / introduction only.
   It does not represent completion or settlement of
   a securities transaction.
========================================================= */

const VentureInterestSchema =
  new mongoose.Schema(
    {

      ventureId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:"Venture",

        required:true,

        index:true
      },


      userId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:"User",

        required:true,

        index:true
      },


      type:{
        type:String,

        enum:[
          "save",
          "follow",
          "grant",
          "sponsorship",
          "mentorship",
          "pilot",
          "investment"
        ],

        required:true,

        index:true
      },


      status:{
        type:String,

        enum:[
          "active",
          "pending",
          "accepted",
          "declined",
          "withdrawn",
          "closed"
        ],

        default:"active",

        index:true
      },


      message:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      /* =====================================================
         FUNDING / INVESTOR INTEREST
      ====================================================== */

      amountMin:{
        type:Number,

        min:0,

        default:0
      },


      amountMax:{
        type:Number,

        min:0,

        default:0
      },


      currency:{
        type:String,

        trim:true,

        uppercase:true,

        maxlength:10,

        default:"PHP"
      },


      /* =====================================================
         PRIVATE FOUNDER RESPONSE
      ====================================================== */

      founderResponse:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      respondedAt:{
        type:Date,

        default:null
      }

    },
    {
      timestamps:true
    }
  );


/* =========================================================
   ONE RELATIONSHIP OF EACH TYPE PER USER / VENTURE
========================================================= */

VentureInterestSchema.index(
  {
    ventureId:1,
    userId:1,
    type:1
  },
  {
    unique:true
  }
);


VentureInterestSchema.index({
  ventureId:1,
  type:1,
  status:1,
  createdAt:-1
});


VentureInterestSchema.index({
  userId:1,
  type:1,
  status:1,
  createdAt:-1
});


module.exports =
  mongoose.model(
    "VentureInterest",
    VentureInterestSchema
  );
