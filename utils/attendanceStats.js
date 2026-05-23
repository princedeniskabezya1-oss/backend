// utils/attendanceStats.js

function toPercent(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getAttendanceWeight(status) {
  if (status === "present") return 1;
  if (status === "late") return 0.75;
  if (status === "excused") return 0.5;
  return 0;
}

function summarizeAttendance(records = []) {
  const total = records.length;

  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const excused = records.filter((r) => r.status === "excused").length;

  const weighted = records.reduce((sum, r) => {
    return sum + getAttendanceWeight(r.status);
  }, 0);

  const attendancePercent = total ? toPercent((weighted / total) * 100) : 0;

  const participationRecords = records.filter(
    (r) => typeof r.participationScore === "number"
  );

  const participationAverage = participationRecords.length
    ? toPercent(
        participationRecords.reduce(
          (sum, r) => sum + Number(r.participationScore || 0),
          0
        ) / participationRecords.length
      )
    : 0;

  let riskLevel = "low";

  if (attendancePercent < 60 || absent >= 4) {
    riskLevel = "high";
  } else if (attendancePercent < 80 || absent >= 2 || late >= 3) {
    riskLevel = "medium";
  }

  return {
    total,
    present,
    late,
    absent,
    excused,
    attendancePercent,
    participationAverage,
    riskLevel,
  };
}

module.exports = {
  toPercent,
  summarizeAttendance,
};
