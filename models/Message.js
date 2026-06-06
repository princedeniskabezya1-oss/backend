const mongoose = require("mongoose");

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: {
      type: String,
      trim: true
    },

    secureUrl: {
      type: String,
      trim: true
    },

    publicId: {
      type: String,
      trim: true
    },

    type: {
      type: String,
      enum: [
        "image",
        "video",
        "audio",
        "document",
        "file",
        "other"
      ],
      default: "file"
    },

    mimeType: {
      type: String,
      trim: true
    },

    originalName: {
      type: String,
      trim: true
    },

    size: {
      type: Number,
      default: 0
    },

    width: Number,
    height: Number,
    duration: Number,

    thumbnailUrl: {
      type: String,
      trim: true
    }
  },
  {
    _id: false
  }
);

const reactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    reaction: {
      type: String,
      trim: true,
      maxlength: 40
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const readReceiptSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    readAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const deliveryReceiptSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    deliveredAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const editHistorySchema = new Schema(
  {
    text: {
      type: String,
      default: "",
      maxlength: 10000
    },

    editedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const callMetaSchema = new Schema(
  {
    callType: {
      type: String,
      enum: ["audio", "video", "meeting"],
      default: "audio"
    },

    status: {
      type: String,
      enum: [
        "missed",
        "declined",
        "ended",
        "started",
        "failed",
        "cancelled"
      ],
      default: "started"
    },

    startedAt: Date,
    endedAt: Date,

    durationSeconds: {
      type: Number,
      default: 0
    },

    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting"
    },

    meetingUrl: {
      type: String,
      trim: true
    }
  },
  {
    _id: false
  }
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true
      }
    ],

    messageType: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "file",
        "call",
        "meeting",
        "system"
      ],
      default: "text",
      index: true
    },

    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 10000
    },

    attachments: [attachmentSchema],

    fileUrl: {
      type: String,
      trim: true
    },

    fileType: {
      type: String,
      trim: true
    },

    fileName: {
      type: String,
      trim: true
    },

    fileSize: {
      type: Number,
      default: 0
    },

    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true
    },

    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },

    reactions: [reactionSchema],

    readBy: [readReceiptSchema],

    deliveredTo: [deliveryReceiptSchema],

    seen: {
      type: Boolean,
      default: false,
      index: true
    },

    seenAt: {
      type: Date
    },

    deliveredAt: {
      type: Date
    },

    status: {
      type: String,
      enum: ["sending", "sent", "delivered", "seen", "failed"],
      default: "sent",
      index: true
    },

    isEdited: {
      type: Boolean,
      default: false
    },

    editedAt: {
      type: Date
    },

    editHistory: [editHistorySchema],

    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    deletedForEveryone: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date
    },

    starredBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    pinnedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    call: callMetaSchema,

    metadata: {
      userAgent: String,
      ipAddress: String,
      clientMessageId: String
    }
  },
  {
    timestamps: true
  }
);

messageSchema.pre("save", function(next){

  if(!this.participants || this.participants.length === 0){
    this.participants = [
      this.sender,
      this.receiver
    ];
  }

  if(this.attachments?.length && this.messageType === "text"){
    const firstType = this.attachments[0].type || "file";
    this.messageType = firstType;
  }

  if(this.fileUrl && !this.attachments?.length){
    let type = "file";

    if(this.fileType?.includes("image")) type = "image";
    if(this.fileType?.includes("video")) type = "video";
    if(this.fileType?.includes("audio")) type = "audio";
    if(this.fileType?.includes("pdf") || this.fileType?.includes("document")) type = "document";

    this.attachments = [
      {
        url: this.fileUrl,
        secureUrl: this.fileUrl,
        type,
        mimeType: this.fileType || "",
        originalName: this.fileName || ""
      }
    ];

    if(this.messageType === "text"){
      this.messageType = type;
    }
  }

  next();
});

messageSchema.methods.isParticipant = function(userId){
  return (
    String(this.sender) === String(userId) ||
    String(this.receiver) === String(userId) ||
    this.participants.some(id => String(id) === String(userId))
  );
};

messageSchema.methods.markSeenBy = function(userId){
  this.seen = true;
  this.seenAt = new Date();
  this.status = "seen";

  const alreadyRead =
    this.readBy.some(item => String(item.user) === String(userId));

  if(!alreadyRead){
    this.readBy.push({
      user:userId,
      readAt:new Date()
    });
  }
};

messageSchema.methods.markDeliveredTo = function(userId){
  this.deliveredAt = new Date();

  if(this.status === "sent"){
    this.status = "delivered";
  }

  const alreadyDelivered =
    this.deliveredTo.some(item => String(item.user) === String(userId));

  if(!alreadyDelivered){
    this.deliveredTo.push({
      user:userId,
      deliveredAt:new Date()
    });
  }
};

messageSchema.methods.softDeleteFor = function(userId){
  const alreadyDeleted =
    this.deletedFor.some(id => String(id) === String(userId));

  if(!alreadyDeleted){
    this.deletedFor.push(userId);
  }
};

messageSchema.methods.softDeleteForEveryone = function(){
  this.deletedForEveryone = true;
  this.deletedAt = new Date();
  this.text = "";
  this.fileUrl = "";
  this.fileType = "";
  this.fileName = "";
  this.fileSize = 0;
  this.attachments = [];
};

messageSchema.methods.toggleStar = function(userId){
  const exists =
    this.starredBy.some(id => String(id) === String(userId));

  if(exists){
    this.starredBy =
      this.starredBy.filter(id => String(id) !== String(userId));
    return false;
  }

  this.starredBy.push(userId);
  return true;
};

messageSchema.methods.editText = function(newText){
  this.editHistory.push({
    text:this.text || "",
    editedAt:new Date()
  });

  this.text = newText;
  this.isEdited = true;
  this.editedAt = new Date();
};

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });
messageSchema.index({ participants: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, seen: 1 });
messageSchema.index({ deletedFor: 1 });
messageSchema.index({ starredBy: 1 });
messageSchema.index({ text: "text" });

module.exports = mongoose.model("Message", messageSchema);
