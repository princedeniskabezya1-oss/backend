// utils/attendanceStats.js

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  if (Number.isNaN(n)) {
    return fallback;
  }

  return n;
}

function toPercent(value) {
  const n = safeNumber(value, 0);

  return Math.max(
    0,
    Math.min(100, Math.round(n))
  );
}

function average(values = []) {
  if (!values.length) return 0;

  const total = values.reduce((sum, value) => {
    return sum + safeNumber(value, 0);
  }, 0);

  return total / values.length;
}

function getAttendanceWeight(status) {
  if (status === "present") return 1;

  if (status === "late") return 0.75;

  if (status === "excused") return 0.5;

  return 0;
}

function calculateParticipation(records = []) {
  const participationRecords = records.filter(
    (r) =>
      typeof r.participationScore === "number"
  );

  if (!participationRecords.length) {
    return 0;
  }

  return toPercent(
    average(
      participationRecords.map((r) =>
        safeNumber(r.participationScore, 0)
      )
    )
  );
}

function calculateAttendancePercent(records = []) {
  if (!records.length) return 0;

  const weighted = records.reduce((sum, record) => {
    return (
      sum +
      getAttendanceWeight(record.status)
    );
  }, 0);

  return toPercent(
    (weighted / records.length) * 100
  );
}

function calculateRiskLevel({
  attendancePercent = 0,
  absent = 0,
  late = 0,
  participationAverage = 0,
}) {
  if (
    attendancePercent < 60 ||
    absent >= 4 ||
    participationAverage < 40
  ) {
    return "high";
  }

  if (
    attendancePercent < 80 ||
    absent >= 2 ||
    late >= 3 ||
    participationAverage < 65
  ) {
    return "medium";
  }

  return "low";
}
function summarizeAttendance(records = []) {
  const total = records.length;

  const present = records.filter(
    (r) => r.status === "present"
  ).length;

  const late = records.filter(
    (r) => r.status === "late"
  ).length;

  const absent = records.filter(
    (r) => r.status === "absent"
  ).length;

  const excused = records.filter(
    (r) => r.status === "excused"
  ).length;

  const attendancePercent =
    calculateAttendancePercent(records);

  const participationAverage =
    calculateParticipation(records);

  const riskLevel = calculateRiskLevel({
    attendancePercent,
    absent,
    late,
    participationAverage,
  });

  const attendanceHealth =
    toPercent(
      (
        attendancePercent * 0.7 +
        participationAverage * 0.3
      )
    );

  return {
    total,

    present,
    late,
    absent,
    excused,

    attendancePercent,

    participationAverage,

    attendanceHealth,

    riskLevel,

    trends: {
      positive:
        attendancePercent >= 85 &&
        participationAverage >= 75,

      declining:
        attendancePercent < 70 ||
        participationAverage < 55,
    },
  };
}

module.exports = {
  safeNumber,
  toPercent,
  average,

  getAttendanceWeight,

  calculateParticipation,
  calculateAttendancePercent,
  calculateRiskLevel,

  summarizeAttendance,
};
