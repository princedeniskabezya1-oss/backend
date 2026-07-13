"use strict";

const mongoose = require("mongoose");

/* =========================================================
   REAL-TIME ANALYTICS CONSTANTS
========================================================= */

/*
  All private school analytics notifications use this event.

  The frontend analytics dashboard can listen for:

  analytics:updated

  and reload only the currently selected date range.
*/
const ANALYTICS_UPDATED_EVENT =
  "analytics:updated";

/*
  Some events may happen very rapidly, such as post views.

  This in-memory debounce map prevents the backend from
  sending a separate Socket.IO message for every event.
*/
const pendingSchoolUpdates =
  new Map();

/*
  Default delay used to group several events for one school
  into a single real-time notification.
*/
const DEFAULT_DEBOUNCE_MS =
  750;

/*
  Maximum number of event names retained in one notification.
*/
const MAX_EVENT_TYPES_PER_UPDATE =
  25;

/* =========================================================
   GENERAL HELPERS
========================================================= */

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );
}

function normalizeEventType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
}

function normalizeEntityType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
}

function normalizeSource(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function normalizeTimestamp(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value || Date.now());

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function normalizeDebounceMs(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_DEBOUNCE_MS;
  }

  return Math.max(
    100,
    Math.min(
      Math.floor(number),
      5000
    )
  );
}

/* =========================================================
   SCHOOL ROOM HELPERS
========================================================= */

/*
  Private school analytics rooms use a namespaced room rather
  than only the raw school ID.

  This prevents unrelated socket listeners from accidentally
  receiving analytics notifications.
*/
function schoolAnalyticsRoom(schoolId) {
  if (!isValidObjectId(schoolId)) {
    throw new TypeError(
      "A valid schoolId is required to build an analytics room."
    );
  }

  return `school-analytics:${String(schoolId)}`;
}

/*
  Existing routes may already send other events to the raw
  school ID room. Analytics uses a separate private room.
*/
function legacySchoolRoom(schoolId) {
  if (!isValidObjectId(schoolId)) {
    throw new TypeError(
      "A valid schoolId is required to build a school room."
    );
  }

  return String(schoolId);
}

/* =========================================================
   PAYLOAD CREATION
========================================================= */

function createAnalyticsUpdatePayload({
  schoolId,
  eventTypes = [],
  entityTypes = [],
  source = "unknown",
  occurredAt = new Date(),
  refreshSuggested = true
}) {
  const cleanEventTypes = [
    ...new Set(
      eventTypes
        .map(normalizeEventType)
        .filter(Boolean)
    )
  ].slice(
    0,
    MAX_EVENT_TYPES_PER_UPDATE
  );

  const cleanEntityTypes = [
    ...new Set(
      entityTypes
        .map(normalizeEntityType)
        .filter(Boolean)
    )
  ].slice(
    0,
    MAX_EVENT_TYPES_PER_UPDATE
  );

  return {
    schoolId:
      String(schoolId),

    eventTypes:
      cleanEventTypes,

    entityTypes:
      cleanEntityTypes,

    source:
      normalizeSource(source) ||
      "unknown",

    occurredAt:
      normalizeTimestamp(
        occurredAt
      ).toISOString(),

    refreshSuggested:
      Boolean(refreshSuggested)
  };
}

/* =========================================================
   IMMEDIATE EMISSION
========================================================= */

/*
  Emit one analytics update immediately.

  Use this only for events where an immediate dashboard update
  is useful, such as:

  - follow
  - unfollow
  - student added
  - teacher added
  - assignment submitted
  - assignment reviewed
  - attendance updated

  High-frequency events such as post impressions and views
  should normally use the debounced emitter below.
*/
function emitAnalyticsUpdateNow({
  io,
  schoolId,
  eventTypes = [],
  entityTypes = [],
  source = "unknown",
  occurredAt = new Date(),
  refreshSuggested = true,
  includeLegacySchoolRoom = false
}) {
  if (!io) {
    return {
      emitted: false,
      skipped: true,
      reason: "socket_unavailable"
    };
  }

  if (!isValidObjectId(schoolId)) {
    return {
      emitted: false,
      skipped: true,
      reason: "invalid_school_id"
    };
  }

  const payload =
    createAnalyticsUpdatePayload({
      schoolId,
      eventTypes,
      entityTypes,
      source,
      occurredAt,
      refreshSuggested
    });

  const analyticsRoom =
    schoolAnalyticsRoom(
      schoolId
    );

  io.to(analyticsRoom).emit(
    ANALYTICS_UPDATED_EVENT,
    payload
  );

  /*
    This option is disabled by default because analytics
    should remain private to clients that explicitly joined
    the analytics room.
  */
  if (includeLegacySchoolRoom) {
    io.to(
      legacySchoolRoom(schoolId)
    ).emit(
      ANALYTICS_UPDATED_EVENT,
      payload
    );
  }

  return {
    emitted: true,
    room: analyticsRoom,
    payload
  };
}

/* =========================================================
   DEBOUNCED EMISSION
========================================================= */

/*
  Group rapid analytics events for the same school.

  Example:

  Ten post views received in 500 milliseconds result in one
  analytics:updated Socket.IO message instead of ten.
*/
function queueAnalyticsUpdate({
  io,
  schoolId,
  eventType,
  entityType = null,
  source = "unknown",
  occurredAt = new Date(),
  debounceMs = DEFAULT_DEBOUNCE_MS,
  refreshSuggested = true
}) {
  if (!io) {
    return {
      queued: false,
      skipped: true,
      reason: "socket_unavailable"
    };
  }

  if (!isValidObjectId(schoolId)) {
    return {
      queued: false,
      skipped: true,
      reason: "invalid_school_id"
    };
  }

  const key =
    String(schoolId);

  let pending =
    pendingSchoolUpdates.get(key);

  if (!pending) {
    pending = {
      io,
      schoolId:
        key,

      eventTypes:
        new Set(),

      entityTypes:
        new Set(),

      source:
        normalizeSource(source) ||
        "unknown",

      occurredAt:
        normalizeTimestamp(
          occurredAt
        ),

      refreshSuggested:
        Boolean(refreshSuggested),

      timer:
        null
    };

    pendingSchoolUpdates.set(
      key,
      pending
    );
  }

  const cleanEventType =
    normalizeEventType(
      eventType
    );

  const cleanEntityType =
    normalizeEntityType(
      entityType
    );

  if (cleanEventType) {
    pending.eventTypes.add(
      cleanEventType
    );
  }

  if (cleanEntityType) {
    pending.entityTypes.add(
      cleanEntityType
    );
  }

  pending.io =
    io;

  pending.source =
    normalizeSource(source) ||
    pending.source ||
    "unknown";

  pending.occurredAt =
    normalizeTimestamp(
      occurredAt
    );

  pending.refreshSuggested =
    pending.refreshSuggested ||
    Boolean(refreshSuggested);

  if (pending.timer) {
    clearTimeout(
      pending.timer
    );
  }

  pending.timer =
    setTimeout(
      () => {
        const current =
          pendingSchoolUpdates.get(
            key
          );

        if (!current) {
          return;
        }

        pendingSchoolUpdates.delete(
          key
        );

        emitAnalyticsUpdateNow({
          io:
            current.io,

          schoolId:
            current.schoolId,

          eventTypes:
            [
              ...current.eventTypes
            ],

          entityTypes:
            [
              ...current.entityTypes
            ],

          source:
            current.source,

          occurredAt:
            current.occurredAt,

          refreshSuggested:
            current.refreshSuggested
        });
      },
      normalizeDebounceMs(
        debounceMs
      )
    );

  /*
    Do not keep Node.js alive only because a debounce timer is
    pending during shutdown.
  */
  if (
    typeof pending.timer.unref ===
    "function"
  ) {
    pending.timer.unref();
  }

  return {
    queued: true,
    schoolId: key,
    eventType:
      cleanEventType ||
      null
  };
}

/* =========================================================
   FLUSHING
========================================================= */

/*
  Force a pending school update to emit immediately.

  Useful in tests or before a controlled application shutdown.
*/
function flushAnalyticsUpdate(
  schoolId
) {
  if (!isValidObjectId(schoolId)) {
    return {
      flushed: false,
      skipped: true,
      reason: "invalid_school_id"
    };
  }

  const key =
    String(schoolId);

  const pending =
    pendingSchoolUpdates.get(key);

  if (!pending) {
    return {
      flushed: false,
      skipped: true,
      reason: "nothing_pending"
    };
  }

  if (pending.timer) {
    clearTimeout(
      pending.timer
    );
  }

  pendingSchoolUpdates.delete(
    key
  );

  const result =
    emitAnalyticsUpdateNow({
      io:
        pending.io,

      schoolId:
        pending.schoolId,

      eventTypes:
        [
          ...pending.eventTypes
        ],

      entityTypes:
        [
          ...pending.entityTypes
        ],

      source:
        pending.source,

      occurredAt:
        pending.occurredAt,

      refreshSuggested:
        pending.refreshSuggested
    });

  return {
    flushed: true,
    result
  };
}

/*
  Flush every pending analytics update.
*/
function flushAllAnalyticsUpdates() {
  const schoolIds = [
    ...pendingSchoolUpdates.keys()
  ];

  return schoolIds.map(
    schoolId =>
      flushAnalyticsUpdate(
        schoolId
      )
  );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  ANALYTICS_UPDATED_EVENT,
  DEFAULT_DEBOUNCE_MS,

  schoolAnalyticsRoom,
  legacySchoolRoom,

  createAnalyticsUpdatePayload,

  emitAnalyticsUpdateNow,
  queueAnalyticsUpdate,

  flushAnalyticsUpdate,
  flushAllAnalyticsUpdates
};
