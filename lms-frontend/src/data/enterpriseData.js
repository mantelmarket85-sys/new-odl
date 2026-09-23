/* =========================================================================
 * ENTERPRISE LMS — DUMMY STATIC DATA
 * --------------------------------------------------------------------------
 * Used by all new enterprise roles: Focal Person, Course Coordinator (extra),
 * Exam Coordinator, Finance Coordinator, Director QEC, Provost.
 *
 * 100% client-side, no API.
 * ======================================================================= */

import { facultyRoster, studentRoster } from "./mockData";

/* ------------------------------------------------------------------ */
/* 1. ADCS SCHEME OF STUDY (must total 72 credit-hours)                */
/* ------------------------------------------------------------------ */
export const adcsScheme = {
  totalRequired: 72,
  semesters: [
    {
      num: 1, label: "Semester 1",
      courses: [
        { code: "CS101",  name: "Introduction to Computing",       credits: 3 },
        { code: "ENG101", name: "Functional English",              credits: 3 },
        { code: "MTH101", name: "Calculus & Analytical Geometry",  credits: 3 },
        { code: "ISL101", name: "Islamic Studies",                 credits: 2 },
        { code: "PHY101", name: "Applied Physics",                 credits: 3 },
        { code: "PST101", name: "Pakistan Studies",                credits: 2 },
      ],
    },
    {
      num: 2, label: "Semester 2",
      courses: [
        { code: "CS102",  name: "Programming Fundamentals",        credits: 3 },
        { code: "ENG102", name: "Communication Skills",            credits: 3 },
        { code: "MTH102", name: "Discrete Structures",             credits: 3 },
        { code: "STA101", name: "Probability & Statistics",        credits: 3 },
        { code: "ENG103", name: "Technical Writing",               credits: 3 },
        { code: "CS103",  name: "Digital Logic Design",            credits: 3 },
      ],
    },
    {
      num: 3, label: "Semester 3",
      courses: [
        { code: "CS201",  name: "Object Oriented Programming",     credits: 4 },
        { code: "CS202",  name: "Data Structures",                 credits: 3 },
        { code: "CS203",  name: "Computer Organization",           credits: 3 },
        { code: "CS204",  name: "Discrete Mathematics",            credits: 3 },
        { code: "CS205",  name: "Theory of Automata",              credits: 3 },
        { code: "GEN201", name: "Ethics",                          credits: 2 },
      ],
    },
    {
      num: 4, label: "Semester 4",
      courses: [
        { code: "CS301",  name: "Database Systems",                credits: 4 },
        { code: "CS302",  name: "Operating Systems",               credits: 3 },
        { code: "CS303",  name: "Computer Networks",               credits: 3 },
        { code: "CS401",  name: "Web Engineering",                 credits: 3 },
        { code: "CS402",  name: "Software Engineering",            credits: 3 },
        { code: "CS499",  name: "Final Year Project",              credits: 3 },
      ],
    },
  ],
};

export const computeSchemeTotal = (scheme = adcsScheme) =>
  scheme.semesters.reduce(
    (t, s) => t + s.courses.reduce((tc, c) => tc + (Number(c.credits) || 0), 0),
    0
  );

/* ------------------------------------------------------------------ */
/* 2. ENROLLMENT MANAGEMENT                                            */
/* ------------------------------------------------------------------ */
export const enrollmentRequests = [
  { id: "ENR-2025-001", student: "Ayesha Khan",   rollNo: "ADCS-23-101", program: "ADCS", semester: 4, course: "CS301 — Database Systems",        type: "Regular",     status: "Pending",  date: "2025-01-12", reason: "—" },
  { id: "ENR-2025-002", student: "Fahad Khalid",  rollNo: "ADCS-23-102", program: "ADCS", semester: 4, course: "CS302 — Operating Systems",       type: "Retake",      status: "Pending",  date: "2025-01-12", reason: "Failed in S3" },
  { id: "ENR-2025-003", student: "Hamza Yousaf",  rollNo: "ADCS-23-103", program: "ADCS", semester: 4, course: "CS401 — Web Engineering",         type: "Regular",     status: "Approved", date: "2025-01-10", reason: "—" },
  { id: "ENR-2025-004", student: "Maryam",        rollNo: "ADCS-23-104", program: "ADCS", semester: 3, course: "CS204 — Discrete Mathematics",    type: "Improvement", status: "Pending",  date: "2025-01-11", reason: "Improving C grade" },
  { id: "ENR-2025-005", student: "Ali Hassan",    rollNo: "ADCS-23-105", program: "ADCS", semester: 4, course: "CS402 — Software Engineering",    type: "Regular",     status: "Approved", date: "2025-01-09", reason: "—" },
  { id: "ENR-2025-006", student: "Zainab Bibi",   rollNo: "ADCS-23-106", program: "ADCS", semester: 2, course: "CS103 — Digital Logic Design",    type: "Retake",      status: "Rejected", date: "2025-01-08", reason: "Attendance shortage" },
  { id: "ENR-2025-007", student: "Usman Ali",     rollNo: "ADCS-23-107", program: "ADCS", semester: 4, course: "CS499 — Final Year Project",      type: "Regular",     status: "Pending",  date: "2025-01-12", reason: "—" },
  { id: "ENR-2025-008", student: "Hira Khan",     rollNo: "ADCS-23-108", program: "ADCS", semester: 3, course: "CS202 — Data Structures",         type: "Retake",      status: "Approved", date: "2025-01-07", reason: "Failed previously" },
];

/* Students promoted to next semester (auto-enrollment trigger) */
export const promotionList = [
  { id: 1, student: "Ayesha Khan",  rollNo: "ADCS-23-101", from: "Semester 3", to: "Semester 4", gpa: 3.78, status: "Promoted", date: "2025-01-05" },
  { id: 2, student: "Fahad Khalid", rollNo: "ADCS-23-102", from: "Semester 3", to: "Semester 4", gpa: 2.95, status: "Promoted with Retake", date: "2025-01-05" },
  { id: 3, student: "Hamza Yousaf", rollNo: "ADCS-23-103", from: "Semester 3", to: "Semester 4", gpa: 3.42, status: "Promoted", date: "2025-01-05" },
  { id: 4, student: "Maryam",       rollNo: "ADCS-23-104", from: "Semester 2", to: "Semester 3", gpa: 3.15, status: "Promoted", date: "2025-01-05" },
  { id: 5, student: "Ali Hassan",   rollNo: "ADCS-23-105", from: "Semester 3", to: "Semester 4", gpa: 3.85, status: "Promoted", date: "2025-01-05" },
  { id: 6, student: "Zainab Bibi",  rollNo: "ADCS-23-106", from: "Semester 1", to: "Semester 2", gpa: 2.65, status: "Promoted", date: "2025-01-05" },
];

export const retakeCases = [
  { id: 1, student: "Fahad Khalid", rollNo: "ADCS-23-102", course: "CS204 — Discrete Mathematics", originalGrade: "F",  type: "Retake",      session: "Spring 2025", status: "Approved" },
  { id: 2, student: "Maryam",       rollNo: "ADCS-23-104", course: "CS203 — Computer Organization", originalGrade: "C", type: "Improvement", session: "Spring 2025", status: "Pending" },
  { id: 3, student: "Hira Khan",    rollNo: "ADCS-23-108", course: "CS202 — Data Structures",       originalGrade: "F", type: "Retake",      session: "Spring 2025", status: "Approved" },
  { id: 4, student: "Usman Ali",    rollNo: "ADCS-23-107", course: "CS103 — Digital Logic Design",  originalGrade: "D", type: "Improvement", session: "Fall 2024",   status: "Approved" },
];

export const withdrawCases = [
  { id: 1, student: "Bilal Ahmed",  rollNo: "ADCS-23-109", course: "CS302 — Operating Systems",  session: "Spring 2025", reason: "Medical Emergency",   status: "Pending",  date: "2025-01-08" },
  { id: 2, student: "Sara Tariq",   rollNo: "ADCS-23-110", course: "CS401 — Web Engineering",    session: "Spring 2025", reason: "Personal Reasons",    status: "Approved", date: "2025-01-05" },
  { id: 3, student: "Omar Farooq",  rollNo: "ADCS-23-111", course: "CS402 — Software Engineering",session: "Fall 2024",  reason: "Financial Issue",     status: "Rejected", date: "2024-12-20" },
];

/* ------------------------------------------------------------------ */
/* 3. STUDENT DROP                                                     */
/* ------------------------------------------------------------------ */
export const DROP_REASONS = [
  "Fee Issue",
  "Discipline Issue",
  "Academic Issue",
  "Attendance Issue",
  "Other",
];

export const droppedStudents = [
  { id: 1, student: "Imran Ali",    rollNo: "ADCS-22-088", program: "ADCS", reason: "Fee Issue",        droppedBy: "Dr. Saima Riaz", date: "2024-12-15", canRejoin: false },
  { id: 2, student: "Nadia Khan",   rollNo: "ADCS-22-076", program: "ADCS", reason: "Attendance Issue", droppedBy: "Dr. Saima Riaz", date: "2024-11-30", canRejoin: false },
  { id: 3, student: "Tahir Khalid", rollNo: "ADCS-22-091", program: "ADCS", reason: "Discipline Issue", droppedBy: "Dr. Saima Riaz", date: "2024-10-18", canRejoin: false },
];

/* ------------------------------------------------------------------ */
/* 4. ATTENDANCE ANALYTICS                                             */
/* ------------------------------------------------------------------ */
export const attendanceAnalytics = [
  { rollNo: "ADCS-23-101", student: "Ayesha Khan",  semester: 4, course: "CS301", percent: 92, status: "Excellent", short: false },
  { rollNo: "ADCS-23-102", student: "Fahad Khalid", semester: 4, course: "CS301", percent: 71, status: "Average",   short: true },
  { rollNo: "ADCS-23-103", student: "Hamza Yousaf", semester: 4, course: "CS302", percent: 88, status: "Good",      short: false },
  { rollNo: "ADCS-23-104", student: "Maryam",       semester: 3, course: "CS202", percent: 65, status: "Low",       short: true },
  { rollNo: "ADCS-23-105", student: "Ali Hassan",   semester: 4, course: "CS401", percent: 95, status: "Excellent", short: false },
  { rollNo: "ADCS-23-106", student: "Zainab Bibi",  semester: 2, course: "CS103", percent: 58, status: "Critical",  short: true },
  { rollNo: "ADCS-23-107", student: "Usman Ali",    semester: 4, course: "CS402", percent: 82, status: "Good",      short: false },
  { rollNo: "ADCS-23-108", student: "Hira Khan",    semester: 3, course: "CS204", percent: 76, status: "Good",      short: false },
  { rollNo: "ADCS-23-109", student: "Bilal Ahmed",  semester: 4, course: "CS302", percent: 49, status: "Critical",  short: true },
  { rollNo: "ADCS-23-110", student: "Sara Tariq",   semester: 4, course: "CS401", percent: 84, status: "Good",      short: false },
];

/* ------------------------------------------------------------------ */
/* 5. ASSESSMENT MONITORING DATA (read-only feed for Focal Person)     */
/* ------------------------------------------------------------------ */
export const assignmentsMonitor = [
  { id: 1, course: "CS301 — Database Systems",       teacher: "Dr. Muhammad Naeem", semester: 4, section: "A", title: "ER Diagram Practice",  due: "2025-01-15", submitted: 38, total: 42, status: "Active" },
  { id: 2, course: "CS302 — Operating Systems",      teacher: "Dr. Asim Shahzad",   semester: 4, section: "A", title: "Process Scheduling",   due: "2025-01-18", submitted: 30, total: 42, status: "Active" },
  { id: 3, course: "CS401 — Web Engineering",        teacher: "Dr. Muhammad Zeeshan",semester: 4,section: "B", title: "Build a Portfolio",    due: "2025-01-20", submitted: 25, total: 35, status: "Active" },
  { id: 4, course: "CS202 — Data Structures",        teacher: "Dr. Muhammad Naeem", semester: 3, section: "A", title: "Linked List Lab",      due: "2025-01-14", submitted: 40, total: 40, status: "Closed" },
  { id: 5, course: "CS402 — Software Engineering",   teacher: "Dr. Asim Shahzad",   semester: 4, section: "B", title: "Requirements Doc",     due: "2025-01-22", submitted: 18, total: 35, status: "Active" },
];

export const quizzesMonitor = [
  { id: 1, course: "CS301 — Database Systems",  teacher: "Dr. Muhammad Naeem",   semester: 4, section: "A", title: "Quiz 1 - Normalization", date: "2025-01-10", avg: 7.8, max: 10, attempted: 40 },
  { id: 2, course: "CS302 — Operating Systems", teacher: "Dr. Asim Shahzad",     semester: 4, section: "A", title: "Quiz 1 - Processes",     date: "2025-01-12", avg: 6.9, max: 10, attempted: 39 },
  { id: 3, course: "CS401 — Web Engineering",   teacher: "Dr. Muhammad Zeeshan", semester: 4, section: "B", title: "Quiz 1 - HTML/CSS",      date: "2025-01-08", avg: 8.2, max: 10, attempted: 34 },
  { id: 4, course: "CS202 — Data Structures",   teacher: "Dr. Muhammad Naeem",   semester: 3, section: "A", title: "Quiz 2 - Trees",         date: "2025-01-11", avg: 7.1, max: 10, attempted: 40 },
];

export const midExamsMonitor = [
  { id: 1, course: "CS301 — Database Systems",  teacher: "Dr. Muhammad Naeem",   semester: 4, section: "A", date: "2025-03-15", status: "Scheduled", avg: 0,  max: 30, total: 42 },
  { id: 2, course: "CS302 — Operating Systems", teacher: "Dr. Asim Shahzad",     semester: 4, section: "A", date: "2025-03-16", status: "Scheduled", avg: 0,  max: 30, total: 42 },
  { id: 3, course: "CS202 — Data Structures",   teacher: "Dr. Muhammad Naeem",   semester: 3, section: "A", date: "2025-03-15", status: "Scheduled", avg: 0,  max: 30, total: 40 },
  { id: 4, course: "CS103 — Digital Logic",     teacher: "Dr. Muhammad Zeeshan", semester: 2, section: "A", date: "2024-11-12", status: "Completed", avg: 21, max: 30, total: 38 },
];

export const finalExamsMonitor = [
  { id: 1, course: "CS301 — Database Systems",  teacher: "Dr. Muhammad Naeem", semester: 4, section: "A", date: "2025-05-22", status: "Scheduled", avg: 0,  max: 50, total: 42 },
  { id: 2, course: "CS302 — Operating Systems", teacher: "Dr. Asim Shahzad",   semester: 4, section: "A", date: "2025-05-24", status: "Scheduled", avg: 0,  max: 50, total: 42 },
];

export const resultsMonitor = [
  { id: 1, student: "Ayesha Khan",  rollNo: "ADCS-23-101", course: "CS202 — Data Structures",      semester: 3, mid: 24, final: 42, total: 81, grade: "A" },
  { id: 2, student: "Fahad Khalid", rollNo: "ADCS-23-102", course: "CS204 — Discrete Mathematics", semester: 3, mid: 12, final: 22, total: 48, grade: "F" },
  { id: 3, student: "Hamza Yousaf", rollNo: "ADCS-23-103", course: "CS202 — Data Structures",      semester: 3, mid: 22, final: 38, total: 74, grade: "B+" },
  { id: 4, student: "Maryam",       rollNo: "ADCS-23-104", course: "CS204 — Discrete Mathematics", semester: 3, mid: 18, final: 30, total: 62, grade: "C" },
  { id: 5, student: "Ali Hassan",   rollNo: "ADCS-23-105", course: "CS202 — Data Structures",      semester: 3, mid: 26, final: 45, total: 86, grade: "A" },
  { id: 6, student: "Zainab Bibi",  rollNo: "ADCS-23-106", course: "CS103 — Digital Logic",        semester: 2, mid: 14, final: 28, total: 52, grade: "D" },
];

/* ------------------------------------------------------------------ */
/* 6. EXTENDED STUDENT DIRECTORY (for advanced search)                 */
/* ------------------------------------------------------------------ */
export const allStudents = [
  { rollNo: "ADCS-23-101", regNo: "FA23-ADCS-101", name: "Ayesha Khan",   fatherName: "Khan Muhammad",     cnic: "35202-1234567-8", mobile: "+92-300-1234567", email: "ayesha.khan@aust.edu.pk",   program: "ADCS", class: "BS-IT-A", semester: 4, section: "A", status: "Active" },
  { rollNo: "ADCS-23-102", regNo: "FA23-ADCS-102", name: "Fahad Khalid",  fatherName: "Khalid Mahmood",    cnic: "35202-2345678-9", mobile: "+92-300-2345678", email: "fahad.khalid@aust.edu.pk",  program: "ADCS", class: "BS-IT-A", semester: 4, section: "A", status: "Active" },
  { rollNo: "ADCS-23-103", regNo: "FA23-ADCS-103", name: "Hamza Yousaf",  fatherName: "Yousaf Ali",        cnic: "35202-3456789-1", mobile: "+92-301-1234567", email: "hamza.yousaf@aust.edu.pk",  program: "ADCS", class: "BS-IT-B", semester: 4, section: "B", status: "Active" },
  { rollNo: "ADCS-23-104", regNo: "FA23-ADCS-104", name: "Maryam",         fatherName: "Saeed Khan",       cnic: "35202-4567891-2", mobile: "+92-302-3456789", email: "maryam@aust.edu.pk",        program: "ADCS", class: "BS-IT-A", semester: 3, section: "A", status: "Active" },
  { rollNo: "ADCS-23-105", regNo: "FA23-ADCS-105", name: "Ali Hassan",     fatherName: "Hassan Ali",       cnic: "35202-5678912-3", mobile: "+92-303-4567891", email: "ali.hassan@aust.edu.pk",    program: "ADCS", class: "BS-IT-B", semester: 4, section: "B", status: "Active" },
  { rollNo: "ADCS-23-106", regNo: "FA23-ADCS-106", name: "Zainab Bibi",    fatherName: "Riaz Ahmad",       cnic: "35202-6789123-4", mobile: "+92-304-5678912", email: "zainab.bibi@aust.edu.pk",   program: "ADCS", class: "BS-IT-C", semester: 2, section: "C", status: "Active" },
  { rollNo: "ADCS-23-107", regNo: "FA23-ADCS-107", name: "Usman Ali",      fatherName: "Ali Muhammad",     cnic: "35202-7891234-5", mobile: "+92-305-6789123", email: "usman.ali@aust.edu.pk",     program: "ADCS", class: "BS-IT-A", semester: 4, section: "A", status: "Active" },
  { rollNo: "ADCS-23-108", regNo: "FA23-ADCS-108", name: "Hira Khan",      fatherName: "Khan Ali",         cnic: "35202-8912345-6", mobile: "+92-306-7891234", email: "hira.khan@aust.edu.pk",     program: "ADCS", class: "BS-IT-A", semester: 3, section: "A", status: "Active" },
  { rollNo: "ADCS-23-109", regNo: "FA23-ADCS-109", name: "Bilal Ahmed",    fatherName: "Ahmed Khan",       cnic: "35202-9123456-7", mobile: "+92-307-8912345", email: "bilal.ahmed@aust.edu.pk",   program: "ADCS", class: "BS-IT-B", semester: 4, section: "B", status: "Active" },
  { rollNo: "ADCS-23-110", regNo: "FA23-ADCS-110", name: "Sara Tariq",     fatherName: "Tariq Aziz",       cnic: "35202-1234578-9", mobile: "+92-308-9123456", email: "sara.tariq@aust.edu.pk",    program: "ADCS", class: "BS-IT-B", semester: 4, section: "B", status: "Active" },
  { rollNo: "ADCS-22-088", regNo: "FA22-ADCS-088", name: "Imran Ali",      fatherName: "Ali Khan",         cnic: "35202-2345689-1", mobile: "+92-309-1234567", email: "imran.ali@aust.edu.pk",     program: "ADCS", class: "BS-IT-A", semester: 4, section: "A", status: "Dropped" },
  { rollNo: "ADCS-22-076", regNo: "FA22-ADCS-076", name: "Nadia Khan",     fatherName: "Khan Tariq",       cnic: "35202-3456891-2", mobile: "+92-310-2345689", email: "nadia.khan@aust.edu.pk",    program: "ADCS", class: "BS-IT-A", semester: 4, section: "A", status: "Dropped" },
];

/* ------------------------------------------------------------------ */
/* 7. TRANSCRIPTS & HISTORY                                            */
/* ------------------------------------------------------------------ */
export const transcripts = {
  "ADCS-23-101": {
    student: "Ayesha Khan",
    rollNo: "ADCS-23-101",
    cgpa: 3.62,
    completedCredits: 54,
    totalCredits: 72,
    semesters: [
      { sem: "Fall 2023",   label: "Semester 1", gpa: 3.55, credits: 16, status: "Completed" },
      { sem: "Spring 2024", label: "Semester 2", gpa: 3.62, credits: 18, status: "Completed" },
      { sem: "Fall 2024",   label: "Semester 3", gpa: 3.71, credits: 19, status: "Completed" },
      { sem: "Spring 2025", label: "Semester 4", gpa: 0,    credits: 19, status: "In Progress" },
    ],
    retakes: [],
    improvements: [],
    withdraws: [],
  },
  "ADCS-23-102": {
    student: "Fahad Khalid",
    rollNo: "ADCS-23-102",
    cgpa: 2.95,
    completedCredits: 48,
    totalCredits: 72,
    semesters: [
      { sem: "Fall 2023",   label: "Semester 1", gpa: 3.15, credits: 16, status: "Completed" },
      { sem: "Spring 2024", label: "Semester 2", gpa: 2.85, credits: 18, status: "Completed" },
      { sem: "Fall 2024",   label: "Semester 3", gpa: 2.90, credits: 14, status: "Completed" },
      { sem: "Spring 2025", label: "Semester 4", gpa: 0,    credits: 19, status: "In Progress" },
    ],
    retakes:    [{ course: "CS204 — Discrete Mathematics", originalGrade: "F", retakeSession: "Spring 2025", newGrade: "—" }],
    improvements:[],
    withdraws:  [],
  },
};

/* ------------------------------------------------------------------ */
/* 8. ACTIVITY LOGS                                                    */
/* ------------------------------------------------------------------ */
export const activityLogs = [
  { id: 1,  timestamp: "2025-01-12 14:32", user: "Dr. Saima Riaz",     type: "enrollment", action: "Approved enrollment",       target: "ENR-2025-003 · Hamza Yousaf · CS401" },
  { id: 2,  timestamp: "2025-01-12 13:55", user: "Dr. Muhammad Naeem", type: "result",     action: "Uploaded mid-term marks",    target: "CS202 · Section A" },
  { id: 3,  timestamp: "2025-01-12 11:20", user: "Dr. Saima Riaz",     type: "enrollment", action: "Marked as RETAKE",          target: "ENR-2025-006 · Zainab · CS103" },
  { id: 4,  timestamp: "2025-01-12 10:18", user: "Dr. Asim Shahzad",   type: "attendance", action: "Submitted attendance",      target: "CS302 · 2025-01-12 · Section A" },
  { id: 5,  timestamp: "2025-01-12 09:45", user: "Prof. Sarah Ahmed",  type: "teacher",    action: "Created course distribution",target: "CS402 → Dr. Asim Shahzad" },
  { id: 6,  timestamp: "2025-01-11 16:08", user: "Dr. Saima Riaz",     type: "student",    action: "Dropped student",           target: "ADCS-22-088 · Imran Ali · Reason: Fee Issue" },
  { id: 7,  timestamp: "2025-01-11 14:30", user: "Mr. Tariq Mahmood",  type: "finance",    action: "Approved fee challan",      target: "FEE-2025-0142 · ADCS-23-101" },
  { id: 8,  timestamp: "2025-01-11 11:02", user: "Dr. Imran Hashmi",   type: "exam",       action: "Published date sheet",      target: "Spring 2025 Mid-Term" },
  { id: 9,  timestamp: "2025-01-10 17:11", user: "Prof. Nadia Aslam",  type: "survey",     action: "Opened survey",             target: "Teacher Evaluation · CS301" },
  { id: 10, timestamp: "2025-01-10 09:30", user: "System",             type: "system",     action: "Auto-promoted students",    target: "5 students · Sem 3 → Sem 4" },
  { id: 11, timestamp: "2025-01-09 15:45", user: "Dr. Saima Riaz",     type: "enrollment", action: "Approved retake",           target: "ENR-2025-008 · Hira Khan · CS202" },
  { id: 12, timestamp: "2025-01-09 12:08", user: "Mr. Tariq Mahmood",  type: "finance",    action: "Sent fee defaulter notice", target: "12 students · Spring 2025" },
];

/* ------------------------------------------------------------------ */
/* 9. SURVEYS & QEC (anonymous)                                        */
/* ------------------------------------------------------------------ */
export const surveys = [
  { id: 1, title: "Teacher Evaluation — CS301 Database Systems",  teacher: "Dr. Muhammad Naeem",   course: "CS301", responses: 38, ratingAvg: 4.6, status: "Active",     opened: "2025-01-05" },
  { id: 2, title: "Teacher Evaluation — CS302 Operating Systems", teacher: "Dr. Asim Shahzad",     course: "CS302", responses: 35, ratingAvg: 4.3, status: "Active",     opened: "2025-01-05" },
  { id: 3, title: "Teacher Evaluation — CS401 Web Engineering",   teacher: "Dr. Muhammad Zeeshan", course: "CS401", responses: 30, ratingAvg: 4.8, status: "Active",     opened: "2025-01-05" },
  { id: 4, title: "Course Evaluation — CS202 Data Structures",    teacher: "Dr. Muhammad Naeem",   course: "CS202", responses: 40, ratingAvg: 4.5, status: "Closed",     opened: "2024-12-10" },
  { id: 5, title: "Course Evaluation — CS103 Digital Logic",      teacher: "Dr. Muhammad Zeeshan", course: "CS103", responses: 28, ratingAvg: 4.1, status: "Closed",     opened: "2024-12-10" },
];

/* Per-survey anonymous feedback (student identity is hidden). */
export const surveyFeedback = [
  { id: 1, surveyId: 1, anonymous: "Student #2841", text: "Excellent explanations and real-world examples.", rating: 5 },
  { id: 2, surveyId: 1, anonymous: "Student #3719", text: "Very supportive teacher, takes time to answer.",  rating: 5 },
  { id: 3, surveyId: 1, anonymous: "Student #1027", text: "Pace is a bit fast in lectures.",                 rating: 4 },
  { id: 4, surveyId: 2, anonymous: "Student #5512", text: "Concepts are clear, more lab work would help.",   rating: 4 },
  { id: 5, surveyId: 3, anonymous: "Student #2841", text: "Best web course I've taken.",                     rating: 5 },
];

/* ------------------------------------------------------------------ */
/* 10. FINANCE                                                         */
/* ------------------------------------------------------------------ */
export const feeRecords = [
  { id: "FEE-2025-0141", student: "Ayesha Khan",   rollNo: "ADCS-23-101", program: "ADCS", semester: 4, amount: 35000, paid: 35000, status: "Paid",     dueDate: "2025-01-15", method: "Bank Transfer" },
  { id: "FEE-2025-0142", student: "Fahad Khalid",  rollNo: "ADCS-23-102", program: "ADCS", semester: 4, amount: 35000, paid: 0,     status: "Pending",  dueDate: "2025-01-20", method: "—" },
  { id: "FEE-2025-0143", student: "Hamza Yousaf",  rollNo: "ADCS-23-103", program: "ADCS", semester: 4, amount: 35000, paid: 35000, status: "Paid",     dueDate: "2025-01-15", method: "Easypaisa" },
  { id: "FEE-2025-0144", student: "Maryam",        rollNo: "ADCS-23-104", program: "ADCS", semester: 3, amount: 35000, paid: 17500, status: "Partial",  dueDate: "2025-01-20", method: "Cash" },
  { id: "FEE-2025-0145", student: "Ali Hassan",    rollNo: "ADCS-23-105", program: "ADCS", semester: 4, amount: 35000, paid: 35000, status: "Paid",     dueDate: "2025-01-15", method: "Bank Transfer" },
  { id: "FEE-2025-0146", student: "Zainab Bibi",   rollNo: "ADCS-23-106", program: "ADCS", semester: 2, amount: 35000, paid: 0,     status: "Overdue",  dueDate: "2024-12-30", method: "—" },
  { id: "FEE-2025-0147", student: "Usman Ali",     rollNo: "ADCS-23-107", program: "ADCS", semester: 4, amount: 35000, paid: 35000, status: "Paid",     dueDate: "2025-01-15", method: "Online" },
  { id: "FEE-2025-0148", student: "Hira Khan",     rollNo: "ADCS-23-108", program: "ADCS", semester: 3, amount: 35000, paid: 0,     status: "Pending",  dueDate: "2025-01-25", method: "—" },
  { id: "FEE-2025-0149", student: "Bilal Ahmed",   rollNo: "ADCS-23-109", program: "ADCS", semester: 4, amount: 35000, paid: 0,     status: "Overdue",  dueDate: "2024-12-28", method: "—" },
  { id: "FEE-2025-0150", student: "Sara Tariq",    rollNo: "ADCS-23-110", program: "ADCS", semester: 4, amount: 35000, paid: 35000, status: "Paid",     dueDate: "2025-01-15", method: "Bank Transfer" },
];

export const feeApprovals = [
  { id: "FEE-2025-0142", student: "Fahad Khalid", amount: 35000, slipUploaded: "2025-01-12", method: "Easypaisa", status: "Pending Approval" },
  { id: "FEE-2025-0144", student: "Maryam",        amount: 17500, slipUploaded: "2025-01-11", method: "Cash",      status: "Pending Approval" },
  { id: "FEE-2025-0148", student: "Hira Khan",     amount: 35000, slipUploaded: "2025-01-10", method: "JazzCash",  status: "Pending Approval" },
];

export const monthlyCollection = [
  { month: "Jul 2024", collected: 4.2 },
  { month: "Aug 2024", collected: 5.8 },
  { month: "Sep 2024", collected: 6.5 },
  { month: "Oct 2024", collected: 4.8 },
  { month: "Nov 2024", collected: 3.6 },
  { month: "Dec 2024", collected: 2.9 },
  { month: "Jan 2025", collected: 8.7 },
];

/* ------------------------------------------------------------------ */
/* 11. EXAMS                                                           */
/* ------------------------------------------------------------------ */
export const examSchedules = [
  { id: 1, course: "CS301 — Database Systems",      type: "Mid Term",   date: "2025-03-15", time: "09:00 AM", duration: "2 hrs", venue: "Hall A", invigilator: "Dr. Muhammad Naeem",   semester: 4, section: "A", students: 42, status: "Scheduled" },
  { id: 2, course: "CS302 — Operating Systems",     type: "Mid Term",   date: "2025-03-16", time: "09:00 AM", duration: "2 hrs", venue: "Hall A", invigilator: "Dr. Asim Shahzad",     semester: 4, section: "A", students: 42, status: "Scheduled" },
  { id: 3, course: "CS401 — Web Engineering",       type: "Mid Term",   date: "2025-03-17", time: "11:00 AM", duration: "2 hrs", venue: "Hall B", invigilator: "Dr. Muhammad Zeeshan", semester: 4, section: "B", students: 35, status: "Scheduled" },
  { id: 4, course: "CS402 — Software Engineering",  type: "Mid Term",   date: "2025-03-18", time: "11:00 AM", duration: "2 hrs", venue: "Hall B", invigilator: "Dr. Asim Shahzad",     semester: 4, section: "B", students: 35, status: "Scheduled" },
  { id: 5, course: "CS202 — Data Structures",       type: "Mid Term",   date: "2025-03-15", time: "02:00 PM", duration: "2 hrs", venue: "Hall A", invigilator: "Dr. Muhammad Naeem",   semester: 3, section: "A", students: 40, status: "Scheduled" },
  { id: 6, course: "CS204 — Discrete Mathematics",  type: "Mid Term",   date: "2025-03-19", time: "09:00 AM", duration: "2 hrs", venue: "Hall A", invigilator: "Dr. Muhammad Zeeshan", semester: 3, section: "A", students: 40, status: "Scheduled" },
  { id: 7, course: "CS103 — Digital Logic",         type: "Final Term", date: "2024-12-20", time: "09:00 AM", duration: "3 hrs", venue: "Hall A", invigilator: "Dr. Muhammad Zeeshan", semester: 2, section: "A", students: 38, status: "Completed" },
];

export const examStats = {
  total: 24,
  scheduled: 18,
  ongoing: 0,
  completed: 6,
  pendingResults: 2,
};

/* ------------------------------------------------------------------ */
/* 12. LIVE CLASS MONITORING                                           */
/* ------------------------------------------------------------------ */
export const classMonitoringFeed = [
  { id: 1, course: "CS301 — Database Systems",      teacher: "Dr. Muhammad Naeem",   semester: 4, section: "A", center: "ODL Main Campus", startTime: "10:00 AM", endTime: "11:30 AM", date: "Today", status: "Live",         attendance: 38 },
  { id: 2, course: "CS302 — Operating Systems",     teacher: "Dr. Asim Shahzad",     semester: 4, section: "A", center: "ODL Main Campus", startTime: "11:30 AM", endTime: "01:00 PM", date: "Today", status: "Scheduled",    attendance: 0 },
  { id: 3, course: "CS401 — Web Engineering",       teacher: "Dr. Muhammad Zeeshan", semester: 4, section: "B", center: "ODL Main Campus", startTime: "02:00 PM", endTime: "03:30 PM", date: "Today", status: "Scheduled",    attendance: 0 },
  { id: 4, course: "CS202 — Data Structures",       teacher: "Dr. Muhammad Naeem",   semester: 3, section: "A", center: "ODL Main Campus", startTime: "09:00 AM", endTime: "10:30 AM", date: "Today", status: "Completed",    attendance: 39 },
  { id: 5, course: "CS402 — Software Engineering",  teacher: "Dr. Asim Shahzad",     semester: 4, section: "B", center: "ODL Main Campus", startTime: "08:00 AM", endTime: "09:30 AM", date: "Yesterday", status: "Missed",   attendance: 0 },
  { id: 6, course: "CS204 — Discrete Mathematics",  teacher: "Dr. Muhammad Zeeshan", semester: 3, section: "A", center: "ODL Main Campus", startTime: "12:30 PM", endTime: "02:00 PM", date: "Yesterday", status: "Rescheduled", attendance: 0 },
];

/* ------------------------------------------------------------------ */
/* 13. TEACHER REPLACEMENT QUEUE                                       */
/* ------------------------------------------------------------------ */
export const teacherReplacements = [
  {
    id: 1,
    course: "CS204 — Discrete Mathematics",
    semester: 3,
    section: "A",
    previousTeacher: "Dr. Muhammad Zeeshan",
    newTeacher: "Dr. Asim Shahzad",
    transferDate: "2025-01-08",
    status: "Completed",
    dataTransferred: {
      attendance: true,
      results: true,
      studentData: true,
      courseHistory: true,
      assessments: true,
      uploadedMaterial: true,
    },
  },
  {
    id: 2,
    course: "CS103 — Digital Logic Design",
    semester: 2,
    section: "C",
    previousTeacher: "Dr. Muhammad Zeeshan",
    newTeacher: "Dr. Muhammad Naeem",
    transferDate: "2025-01-10",
    status: "In Progress",
    dataTransferred: {
      attendance: true,
      results: true,
      studentData: true,
      courseHistory: false,
      assessments: false,
      uploadedMaterial: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* 14. TEACHER DEACTIVATION REQUESTS                                   */
/* ------------------------------------------------------------------ */
export const deactivationRequests = [
  { id: 1, teacher: "Dr. Muhammad Zeeshan", employeeId: "FAC-AUST-213", reason: "Going on long medical leave (4 months)", date: "2025-01-10", status: "Pending" },
];

/* ------------------------------------------------------------------ */
/* 15. PROVOST UNIVERSITY-WIDE                                         */
/* ------------------------------------------------------------------ */
export const universityKpis = {
  totalStudents: 5840,
  totalFaculty: 312,
  totalPrograms: 14,
  totalDepartments: 9,
  feesCollectedYTD: 188400000,
  pendingFees: 12600000,
  satisfaction: 4.6,
  ranking: "Top 50 Pakistan",
};

export const departments = [
  { id: 1, name: "Computer Science",          chair: "Dr. Muhammad Naeem", students: 1240, faculty: 18, programs: 3 },
  { id: 2, name: "Software Engineering",       chair: "Dr. Hina Mansoor",   students: 1180, faculty: 15, programs: 2 },
  { id: 3, name: "Business Administration",    chair: "Dr. Saqib Mehmood",  students: 1340, faculty: 22, programs: 4 },
  { id: 4, name: "Electrical Engineering",     chair: "Dr. Tariq Khan",     students: 720,  faculty: 14, programs: 2 },
  { id: 5, name: "Mathematics",                chair: "Dr. Asif Riaz",      students: 480,  faculty: 9,  programs: 1 },
  { id: 6, name: "English Literature",         chair: "Dr. Farah Aziz",     students: 580,  faculty: 11, programs: 1 },
  { id: 7, name: "Islamic Studies",            chair: "Dr. Khalid Ali",     students: 300,  faculty: 6,  programs: 1 },
];
