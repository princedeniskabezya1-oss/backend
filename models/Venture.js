const mongoose = require("mongoose");


/* =========================================================
   AIFT VENTURE
   Student projects, startups and businesses seeking
   grants, sponsorship, mentorship, pilots or investment
   introductions.
========================================================= */

const VentureSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         OWNER
      ====================================================== */

      ownerId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:"User",

        required:true,

        index:true
      },


      schoolId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:"User",

        default:null,

        index:true
      },


      /* =====================================================
         BASIC IDENTITY
      ====================================================== */

      title:{
        type:String,

        required:true,

        trim:true,

        maxlength:140
      },


      slug:{
        type:String,

        trim:true,

        lowercase:true,

        default:""
      },


      tagline:{
        type:String,

        trim:true,

        maxlength:220,

        default:""
      },


      description:{
        type:String,

        trim:true,

        maxlength:8000,

        default:""
      },


      /* =====================================================
         VENTURE TYPE
      ====================================================== */

      ventureType:{
        type:String,

        enum:[
          "student-project",
          "startup",
          "business",
          "research",
          "social-enterprise"
        ],

        default:"student-project",

        index:true
      },


      stage:{
        type:String,

        enum:[
          "idea",
          "research",
          "prototype",
          "testing",
          "pilot",
          "early-revenue",
          "growth"
        ],

        default:"idea",

        index:true
      },


      industry:{
        type:String,

        trim:true,

        maxlength:100,

        default:""
      },


      tags:{
        type:[String],

        default:[]
      },
             /* =====================================================
         BUILDER DETAILS
      ====================================================== */

      location:{
        type:String,

        trim:true,

        maxlength:160,

        default:""
      },


      solutionStatus:{
        type:String,

        enum:[
          "",
          "concept",
          "prototype",
          "mvp",
          "beta",
          "live",
          "operating"
        ],

        default:""
      },


      marketSize:{
        type:String,

        trim:true,

        maxlength:300,

        default:""
      },


      customerType:{
        type:String,

        enum:[
          "",
          "consumer",
          "business",
          "schools",
          "government",
          "nonprofits",
          "mixed"
        ],

        default:""
      },


      marketReach:{
        type:String,

        enum:[
          "",
          "local",
          "regional",
          "national",
          "southeast_asia",
          "global"
        ],

        default:""
      },


      revenueModel:{
        type:String,

        enum:[
          "",
          "subscription",
          "product_sales",
          "service_fee",
          "transaction_fee",
          "marketplace",
          "advertising",
          "licensing",
          "sponsorship",
          "grant_funded",
          "nonprofit",
          "other"
        ],

        default:""
      },


      revenueStatus:{
        type:String,

        enum:[
          "",
          "pre_revenue",
          "first_sales",
          "recurring_revenue",
          "profitable"
        ],

        default:""
      },


      /* =====================================================
         PROBLEM + SOLUTION
      ====================================================== */

      problem:{
        type:String,

        trim:true,

        maxlength:5000,

        default:""
      },


      solution:{
        type:String,

        trim:true,

        maxlength:5000,

        default:""
      },


      targetMarket:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      businessModel:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      competitiveAdvantage:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      /* =====================================================
         FUNDING
      ====================================================== */

      fundingGoal:{
        type:Number,

        min:0,

        default:0
      },


      currency:{
        type:String,

        trim:true,

        uppercase:true,

        default:"PHP",

        maxlength:10
      },


      fundingRaised:{
        type:Number,

        min:0,

        default:0
      },


      fundingPurpose:{
        type:String,

        trim:true,

        maxlength:3000,

        default:""
      },


      fundingTypes:{
        type:[
          {
            type:String,

            enum:[
              "grant",
              "sponsorship",
              "investment-interest",
              "mentorship",
              "pilot",
              "donation"
            ]
          }
        ],

        default:[]
      },


      /* =====================================================
         INVESTMENT POSITION
         This records what the founder is seeking.
         It does NOT execute or settle securities transactions.
      ====================================================== */

      seekingInvestment:{
        type:Boolean,

        default:false
      },


      investmentRangeMin:{
        type:Number,

        min:0,

        default:0
      },


      investmentRangeMax:{
        type:Number,

        min:0,

        default:0
      },


      investmentNotes:{
        type:String,

        trim:true,

        maxlength:2500,

        default:""
      },
             fundingStage:{
        type:String,

        enum:[
          "",
          "pre_seed",
          "seed",
          "growth",
          "project_funding",
          "grant",
          "not_applicable"
        ],

        default:""
      },


      fundingDeadline:{
        type:Date,

        default:null
      },


      supportMessage:{
        type:String,

        trim:true,

        maxlength:2000,

        default:""
      },


      /* =====================================================
         TEAM
      ====================================================== */

             founderRole:{
        type:String,

        trim:true,

        maxlength:120,

        default:""
      },


      founderBio:{
        type:String,

        trim:true,

        maxlength:1200,

        default:""
      },


      teamSize:{
        type:Number,

        min:1,

        default:1
      },

      teamMembers:[
        {

          userId:{
            type:
              mongoose.Schema.Types.ObjectId,

            ref:"User",

            default:null
          },


          name:{
            type:String,

            trim:true,

            maxlength:120,

            default:""
          },


          role:{
            type:String,

            trim:true,

            maxlength:120,

            default:""
          },


          bio:{
            type:String,

            trim:true,

            maxlength:500,

            default:""
          }

        }
      ],


      /* =====================================================
         TRACTION
      ====================================================== */

      traction:{
        users:{
          type:Number,

          min:0,

          default:0
        },


        customers:{
          type:Number,

          min:0,

          default:0
        },


        revenue:{
          type:Number,

          min:0,

          default:0
        },


        pilots:{
          type:Number,

          min:0,

          default:0
        },


        partnerships:{
          type:Number,

          min:0,

          default:0
        },
                 growth:{
          type:String,

          trim:true,

          maxlength:300,

          default:""
        },


        description:{
          type:String,

          trim:true,

          maxlength:2000,

          default:""
        }
      },


      /* =====================================================
         MEDIA
      ====================================================== */

      logoUrl:{
        type:String,

        trim:true,

        default:""
      },


      coverUrl:{
        type:String,

        trim:true,

        default:""
      },


      pitchVideoUrl:{
        type:String,

        trim:true,

        default:""
      },


      websiteUrl:{
        type:String,

        trim:true,

        default:""
      },


      demoUrl:{
        type:String,

        trim:true,

        default:""
      },


      /* =====================================================
         PITCH DOCUMENTS
      ====================================================== */

      documents:[
        {

          name:{
            type:String,

            trim:true,

            maxlength:180,

            default:""
          },


          type:{
            type:String,

            enum:[
              "pitch-deck",
              "business-plan",
              "financials",
              "research",
              "prototype",
              "other"
            ],

            default:"other"
          },


          url:{
            type:String,

            trim:true,

            default:""
          },


          visibility:{
            type:String,

            enum:[
              "public",
              "interested-only",
              "private"
            ],

            default:"private"
          }

        }
      ],


      /* =====================================================
         VERIFICATION
      ====================================================== */

      schoolVerified:{
        type:Boolean,

        default:false
      },


      verifiedBySchoolId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:"User",

        default:null
      },


      verifiedAt:{
        type:Date,

        default:null
      },


      aiftVerified:{
        type:Boolean,

        default:false
      },


      /* =====================================================
         DISCOVERY / VISIBILITY
      ====================================================== */

      visibility:{
        type:String,

        enum:[
          "public",
          "aift-only",
          "private"
        ],

        default:"public",

        index:true
      },


      status:{
        type:String,

        enum:[
          "draft",
          "submitted",
          "active",
          "paused",
          "funded",
          "closed",
          "rejected"
        ],

        default:"draft",

        index:true
      },


      featured:{
        type:Boolean,

        default:false,

        index:true
      },


      /* =====================================================
         ANALYTICS
      ====================================================== */

      viewsCount:{
        type:Number,

        min:0,

        default:0
      },


      uniqueViewers:[
        {
          type:
            mongoose.Schema.Types.ObjectId,

          ref:"User"
        }
      ],


      savesCount:{
        type:Number,

        min:0,

        default:0
      },


      followersCount:{
        type:Number,

        min:0,

        default:0
      },


      interestCount:{
        type:Number,

        min:0,

        default:0
      },


      sponsorInterestCount:{
        type:Number,

        min:0,

        default:0
      },


      mentorInterestCount:{
        type:Number,

        min:0,

        default:0
      },


      pilotInterestCount:{
        type:Number,

        min:0,

        default:0
      },


      lastViewedAt:{
        type:Date,

        default:null
      }

    },
    {
      timestamps:true
    }
  );


/* =========================================================
   INDEXES
========================================================= */

VentureSchema.index({
  ownerId:1,
  createdAt:-1
});


VentureSchema.index({
  schoolId:1,
  status:1,
  createdAt:-1
});


VentureSchema.index({
  status:1,
  visibility:1,
  createdAt:-1
});


VentureSchema.index({
  ventureType:1,
  stage:1,
  status:1
});


VentureSchema.index({
  industry:1,
  status:1
});


VentureSchema.index({
  fundingTypes:1,
  status:1
});


VentureSchema.index({
  featured:1,
  status:1,
  createdAt:-1
});


VentureSchema.index({
  title:"text",
  tagline:"text",
  description:"text",
  industry:"text",
  tags:"text"
});


/* =========================================================
   NORMALIZATION
========================================================= */

VentureSchema.pre(
  "save",
  function(next){

    if(
      Array.isArray(
        this.tags
      )
    ){

      this.tags =
        [
          ...new Set(
            this.tags
              .map(
                value =>
                  String(
                    value ||
                    ""
                  )
                    .trim()
                    .toLowerCase()
              )
              .filter(Boolean)
          )
        ]
          .slice(
            0,
            30
          );

    }


    if(
      Array.isArray(
        this.fundingTypes
      )
    ){

      this.fundingTypes =
        [
          ...new Set(
            this.fundingTypes
          )
        ];

    }


    next();

  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "Venture",
    VentureSchema
  );
