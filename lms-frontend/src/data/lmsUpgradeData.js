/* =========================================================================
 * LMS UPGRADE DATA
 * Rich mock data used by the upgraded modules (recorded lectures by week,
 * course-wise quizzes & assignments, account-book categories, fines,
 * dropped students, activity logs, exam controller cases, QEC surveys, etc.)
 *
 * These exports SUPPLEMENT — they do not replace — the existing exports
 * already living in mockData.js / enterpriseData.js.
 * ======================================================================= */

import { enrolledCourses, recordedLectures, assignments, quizzes } from "./mockData";

/* --------- helper: week label -------- */
const WK = (n) => `Week ${String(n).padStart(2, "0")}`;

/* =========================================================================
 * 1.  RECORDED LECTURES — organized SUBJECT-WISE then WEEK-WISE
 * ----------------------------------------------------------------------- */
const LECTURE_POOL = [
  // CS-301 Software Engineering
  { code: "CS-301", week: 1, title: "Introduction to Software Engineering",        youtubeId: "I7zKnZAdkrM", duration: "45:22", date: "2024-09-02" },
  { code: "CS-301", week: 1, title: "SDLC Models Overview",                        youtubeId: "GR4f-1Y_4qE", duration: "38:10", date: "2024-09-03" },
  { code: "CS-301", week: 2, title: "Requirements Engineering — Part 1",           youtubeId: "QwevyPLMyAA", duration: "52:10", date: "2024-09-09" },
  { code: "CS-301", week: 2, title: "Requirements Engineering — Part 2",           youtubeId: "Z56UMUobIfc", duration: "47:30", date: "2024-09-10" },
  { code: "CS-301", week: 3, title: "Design Patterns Essentials",                  youtubeId: "v9ejT8FO-7I", duration: "41:55", date: "2024-09-16" },
  { code: "CS-301", week: 3, title: "UML Class Diagrams",                          youtubeId: "UI6lqHOVHic", duration: "39:20", date: "2024-09-17" },
  { code: "CS-301", week: 4, title: "Agile & Scrum Methodologies",                 youtubeId: "9TycLR0TqFA", duration: "55:12", date: "2024-09-23" },
  { code: "CS-301", week: 5, title: "Software Testing Strategies",                 youtubeId: "u6QfIXgjwGQ", duration: "44:18", date: "2024-09-30" },

  // CS-302 Computer Network
  { code: "CS-302", week: 1, title: "Networking Fundamentals",                     youtubeId: "qiQR5rTSshw", duration: "50:40", date: "2024-09-04" },
  { code: "CS-302", week: 1, title: "Network Topologies",                          youtubeId: "Q5RKuOuG6FY", duration: "36:20", date: "2024-09-05" },
  { code: "CS-302", week: 2, title: "OSI Model Deep Dive",                         youtubeId: "vv4y_uOneC0", duration: "58:30", date: "2024-09-11" },
  { code: "CS-302", week: 2, title: "TCP/IP Protocol Suite",                       youtubeId: "PpsEaqJV_A0", duration: "47:15", date: "2024-09-12" },
  { code: "CS-302", week: 3, title: "Routing & Switching",                         youtubeId: "Yl0Wl1Bk_xQ", duration: "49:50", date: "2024-09-18" },
  { code: "CS-302", week: 3, title: "IP Addressing & Subnetting",                  youtubeId: "ZxwbWX-NbXc", duration: "42:10", date: "2024-09-19" },
  { code: "CS-302", week: 4, title: "Network Security Basics",                     youtubeId: "Y5q9w3pHNNs", duration: "45:30", date: "2024-09-25" },

  // CS-303 Data Structures
  { code: "CS-303", week: 1, title: "Arrays & Memory Allocation",                  youtubeId: "8hly31xKli0", duration: "48:30", date: "2024-09-02" },
  { code: "CS-303", week: 2, title: "Linked Lists Explained",                      youtubeId: "njTh_OwMljA", duration: "55:14", date: "2024-09-09" },
  { code: "CS-303", week: 2, title: "Doubly & Circular Linked Lists",              youtubeId: "JdQeNxWCguQ", duration: "44:20", date: "2024-09-10" },
  { code: "CS-303", week: 3, title: "Stacks — Implementation & Applications",      youtubeId: "F1F2imiOJfk", duration: "41:08", date: "2024-09-16" },
  { code: "CS-303", week: 4, title: "Queues & Circular Queues",                    youtubeId: "okr-XE8yTO8", duration: "39:45", date: "2024-09-23" },
  { code: "CS-303", week: 5, title: "Trees & Binary Search Trees",                 youtubeId: "fAAZixBzIAI", duration: "52:30", date: "2024-09-30" },
  { code: "CS-303", week: 5, title: "Tree Traversals — In/Pre/Post Order",         youtubeId: "9RHO6jU--GU", duration: "33:18", date: "2024-10-01" },
  { code: "CS-303", week: 6, title: "Hash Tables & Hashing Functions",             youtubeId: "shs0KM3wKv8", duration: "47:25", date: "2024-10-07" },

  // MTH-301 Discrete Structure
  { code: "MTH-301", week: 1, title: "Logic & Propositions",                       youtubeId: "xTNG3FA-9Lw", duration: "42:55", date: "2024-09-03" },
  { code: "MTH-301", week: 1, title: "Boolean Algebra",                            youtubeId: "iXl_FoNoNNw", duration: "38:40", date: "2024-09-04" },
  { code: "MTH-301", week: 2, title: "Sets and Relations",                         youtubeId: "tyDKR4FG3Yw", duration: "46:10", date: "2024-09-10" },
  { code: "MTH-301", week: 3, title: "Functions & Mappings",                       youtubeId: "M-LJpevr0xc", duration: "39:30", date: "2024-09-17" },
  { code: "MTH-301", week: 4, title: "Mathematical Induction",                     youtubeId: "wMcwY2S2D34", duration: "44:15", date: "2024-09-24" },
  { code: "MTH-301", week: 5, title: "Graph Theory Basics",                        youtubeId: "LFKZLXVO-Dg", duration: "51:00", date: "2024-10-01" },

  // MTH-302 Multivariable Calculus
  { code: "MTH-302", week: 1, title: "Vectors in 3D Space",                        youtubeId: "fNk_zzaMoSs", duration: "47:20", date: "2024-09-03" },
  { code: "MTH-302", week: 2, title: "Partial Derivatives",                        youtubeId: "AXqhWeUEtQU", duration: "43:30", date: "2024-09-10" },
  { code: "MTH-302", week: 3, title: "Multiple Integrals",                         youtubeId: "85zGYB-34jQ", duration: "48:55", date: "2024-09-17" },
  { code: "MTH-302", week: 4, title: "Vector Fields & Line Integrals",             youtubeId: "rB83DpBJQsE", duration: "46:00", date: "2024-09-24" },

  // IS-101 Islamic Studies
  { code: "IS-101", week: 1, title: "Pillars of Islam",                            youtubeId: "8sgycukafqQ", duration: "38:10", date: "2024-09-05" },
  { code: "IS-101", week: 2, title: "Quranic Ethics in Daily Life",                youtubeId: "QkZUC5J_LF8", duration: "41:20", date: "2024-09-12" },
  { code: "IS-101", week: 3, title: "Prophets and Their Mission",                  youtubeId: "iEnZ7nM9-Mw", duration: "44:05", date: "2024-09-19" },

  // CS-303L Data Structures Lab
  { code: "CS-303L", week: 1, title: "Lab 1 — Array Operations in C++",            youtubeId: "VOpjAHCee7c", duration: "32:18", date: "2024-09-06" },
  { code: "CS-303L", week: 2, title: "Lab 2 — Linked List Implementation",         youtubeId: "WeZkjBoY7L4", duration: "35:40", date: "2024-09-13" },
  { code: "CS-303L", week: 3, title: "Lab 3 — Stack Implementation",               youtubeId: "I37kGX-nZEI", duration: "30:55", date: "2024-09-20" },
];

/**
 * lecturesBySubject — array of {code, title, instructor, color, icon, weeks}
 * Each `weeks` entry: {week, label, lectures: [...]} sorted by week.
 */
export const lecturesBySubject = enrolledCourses.map((course) => {
  const courseLectures = LECTURE_POOL.filter((l) => l.code === course.code);
  const weeksMap = courseLectures.reduce((acc, l) => {
    if (!acc[l.week]) acc[l.week] = [];
    acc[l.week].push({
      id: `${course.code}-W${l.week}-${acc[l.week].length + 1}`,
      title: l.title,
      youtubeId: l.youtubeId,
      duration: l.duration,
      date: l.date,
      thumbnail: `https://img.youtube.com/vi/${l.youtubeId}/hqdefault.jpg`,
      views: 120 + Math.floor(Math.random() * 200),
      progress: [0, 35, 80, 100, 100][Math.floor(Math.random() * 5)],
    });
    return acc;
  }, {});
  const weeks = Object.keys(weeksMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((w) => ({ week: Number(w), label: WK(w), lectures: weeksMap[w] }));
  return {
    code: course.code,
    title: course.title,
    instructor: course.instructor,
    color: course.color,
    icon: course.icon,
    credits: course.credits,
    totalLectures: courseLectures.length,
    watchedLectures: Math.floor(courseLectures.length * (course.progress / 100)),
    weeks,
  };
});

/* =========================================================================
 * 2.  COURSE-WISE QUIZZES & ASSIGNMENTS for STUDENT modules
 * ----------------------------------------------------------------------- */
/**
 * `assignmentsByCourse` and `quizzesByCourse` are keyed by course code and
 * include richer details: deadlines, submission status, grade, attempts, etc.
 */
const RICH_ASSIGNMENTS = [
  // CS-301
  { code: "CS-301", week: 1, title: "ER Diagram for Library System",       due: "2024-12-15", status: "Pending",   marks: 20, obtained: null, type: "Document" },
  { code: "CS-301", week: 3, title: "Use Case Diagram — Hospital Mgmt",    due: "2024-11-20", status: "Graded",    marks: 20, obtained: 18,   type: "Document" },
  { code: "CS-301", week: 5, title: "Sprint Planning Report",              due: "2024-12-22", status: "Submitted", marks: 15, obtained: null, type: "Report"   },
  // CS-302
  { code: "CS-302", week: 2, title: "Network Topology Comparison Report",  due: "2024-12-20", status: "Pending",   marks: 20, obtained: null, type: "Report"   },
  { code: "CS-302", week: 3, title: "Subnetting Worksheet",                due: "2024-11-15", status: "Graded",    marks: 15, obtained: 13,   type: "Worksheet"},
  // CS-303
  { code: "CS-303", week: 2, title: "Linked List Implementation in C++",   due: "2024-12-12", status: "Submitted", marks: 25, obtained: 23,   type: "Code"    },
  { code: "CS-303", week: 5, title: "Binary Tree Traversal Code",          due: "2024-11-28", status: "Graded",    marks: 25, obtained: 21,   type: "Code"    },
  { code: "CS-303", week: 6, title: "Hash Table Project",                  due: "2024-12-30", status: "Pending",   marks: 30, obtained: null, type: "Project" },
  // MTH-301
  { code: "MTH-301", week: 4, title: "Proof using Mathematical Induction", due: "2024-12-18", status: "Pending",   marks: 15, obtained: null, type: "Worksheet"},
  { code: "MTH-301", week: 5, title: "Graph Theory Problem Set",           due: "2024-11-30", status: "Graded",    marks: 20, obtained: 17,   type: "Worksheet"},
  // MTH-302
  { code: "MTH-302", week: 3, title: "Triple Integrals — Problem Set",     due: "2024-12-10", status: "Graded",    marks: 20, obtained: 18,   type: "Worksheet"},
  // IS-101
  { code: "IS-101", week: 2, title: "Reflective Essay on Quranic Ethics",  due: "2024-12-22", status: "Pending",   marks: 10, obtained: null, type: "Essay"    },
];
const RICH_QUIZZES = [
  // CS-301
  { code: "CS-301", week: 1, title: "Quiz 1 — Introduction to SE",         deadline: "2024-09-15 23:59", status: "Completed", marks: 15, obtained: 13, duration: 15, questions: 10 },
  { code: "CS-301", week: 2, title: "Quiz 2 — Requirements Engineering",   deadline: "2024-12-14 23:59", status: "Available", marks: 20, obtained: null, duration: 15, questions: 10 },
  { code: "CS-301", week: 4, title: "Quiz 3 — Agile Methodologies",        deadline: "2024-12-28 23:59", status: "Upcoming",  marks: 20, obtained: null, duration: 20, questions: 12 },
  // CS-302
  { code: "CS-302", week: 2, title: "Quiz 1 — OSI Model",                  deadline: "2024-11-28 23:59", status: "Completed", marks: 25, obtained: 22, duration: 20, questions: 12 },
  { code: "CS-302", week: 3, title: "Quiz 2 — Subnetting",                 deadline: "2024-12-20 23:59", status: "Available", marks: 20, obtained: null, duration: 25, questions: 15 },
  // CS-303
  { code: "CS-303", week: 1, title: "Quiz 1 — Arrays",                     deadline: "2024-09-20 23:59", status: "Completed", marks: 15, obtained: 14, duration: 10, questions: 8 },
  { code: "CS-303", week: 3, title: "Quiz 2 — Stacks & Queues",            deadline: "2024-12-16 23:59", status: "Available", marks: 30, obtained: null, duration: 20, questions: 15 },
  { code: "CS-303", week: 5, title: "Quiz 3 — Trees",                      deadline: "2024-12-30 23:59", status: "Upcoming",  marks: 25, obtained: null, duration: 20, questions: 12 },
  // MTH-301
  { code: "MTH-301", week: 1, title: "Quiz 1 — Set Theory",                deadline: "2024-11-30 23:59", status: "Completed", marks: 20, obtained: 18, duration: 15, questions: 10 },
  { code: "MTH-301", week: 5, title: "Quiz 2 — Graph Theory",              deadline: "2024-12-25 23:59", status: "Available", marks: 20, obtained: null, duration: 15, questions: 10 },
  // MTH-302
  { code: "MTH-302", week: 1, title: "Quiz 1 — Vectors",                   deadline: "2024-11-25 23:59", status: "Completed", marks: 20, obtained: 16, duration: 15, questions: 10 },
  // IS-101
  { code: "IS-101", week: 1, title: "Quiz 1 — Pillars of Islam",           deadline: "2024-11-15 23:59", status: "Completed", marks: 15, obtained: 14, duration: 10, questions: 8 },
];

export const assignmentsByCourse = enrolledCourses.map((c) => ({
  ...c,
  items: RICH_ASSIGNMENTS.filter((a) => a.code === c.code).sort((a, b) => a.week - b.week),
}));

export const quizzesByCourse = enrolledCourses.map((c) => ({
  ...c,
  items: RICH_QUIZZES.filter((q) => q.code === c.code).sort((a, b) => a.week - b.week),
}));

/* =========================================================================
 * 3.  STUDENT ACCOUNT BOOK — categorized + fines + receipts
 * ----------------------------------------------------------------------- */
export const accountBookData = {
  summary: {
    totalDue:    18500,
    totalPaid:   55000,
    pendingItems: 3,
    nextDueDate: "2024-12-25",
  },
  semesterFees: [
    { id: "SF-001", semester: "Semester 1 — Fall 2023",  challan: "CH-23-FA-00142", amount: 35000, paid: 35000, status: "Paid",          dueDate: "2023-09-15", paidOn: "2023-09-10", method: "EasyPaisa" },
    { id: "SF-002", semester: "Semester 2 — Spring 2024", challan: "CH-24-SP-00142", amount: 35000, paid: 35000, status: "Paid",          dueDate: "2024-01-20", paidOn: "2024-01-15", method: "JazzCash"   },
    { id: "SF-003", semester: "Semester 3 — Fall 2024",  challan: "CH-24-FA-00142", amount: 35000, paid: 20000, status: "Partially Paid",dueDate: "2024-12-25", paidOn: "2024-09-12", method: "OneLink",   lateFee: 2000 },
    { id: "SF-004", semester: "Semester 4 — Spring 2025", challan: "CH-25-SP-00142", amount: 35000, paid: 0,     status: "Unpaid",         dueDate: "2025-02-10", paidOn: null,         method: null },
  ],
  examinationFees: [
    { id: "EF-001", title: "Mid-Term Exam Fee — Sem 3", challan: "CHE-24-FA-MT01", amount: 2500, paid: 2500, status: "Paid",   dueDate: "2024-10-25", paidOn: "2024-10-22", method: "OneLink" },
    { id: "EF-002", title: "Final Term Exam Fee — Sem 3", challan: "CHE-24-FA-FT01", amount: 3500, paid: 0,    status: "Unpaid", dueDate: "2024-12-30", paidOn: null,         method: null    },
    { id: "EF-003", title: "Recheck Application Fee",      challan: "CHE-24-FA-RC01", amount: 1500, paid: 1500, status: "Paid",   dueDate: "2024-11-30", paidOn: "2024-11-25", method: "JazzCash" },
  ],
  fines: [
    { id: "FN-001", title: "Late Library Book Return",       reason: "Returned book 14 days late",                  amount: 700,  status: "Paid",   addedOn: "2024-10-05", paidOn: "2024-10-09", issuedBy: "Library Admin" },
    { id: "FN-002", title: "Hostel Discipline Violation",     reason: "Noise complaint after 11 PM",                  amount: 1500, status: "Unpaid", addedOn: "2024-11-20", paidOn: null,        issuedBy: "Hostel Warden", dueDate: "2024-12-20" },
    { id: "FN-003", title: "Lab Equipment Damage",            reason: "Broken USB port in CS Lab-2",                  amount: 2500, status: "Unpaid", addedOn: "2024-11-28", paidOn: null,        issuedBy: "Lab In-charge",  dueDate: "2024-12-28" },
    { id: "FN-004", title: "Mobile Phone in Exam Hall",       reason: "Phone seen during Mid-Term exam (warning)",    amount: 1000, status: "Paid",   addedOn: "2024-11-02", paidOn: "2024-11-05", issuedBy: "Examination Dept" },
  ],
};

/* =========================================================================
 * 4.  TEACHER — COURSE HISTORY (semester-wise)
 * ----------------------------------------------------------------------- */
export const teacherCourseHistory = [
  {
    semester: "Spring 2024",
    courses: [
      { code: "CS-301", title: "Software Engineering", sections: ["A", "B"], students: 96, avgAttendance: 87, quizzes: 4, assignments: 6, status: "Completed" },
      { code: "CS-201", title: "Programming Fundamentals", sections: ["A"], students: 48, avgAttendance: 91, quizzes: 5, assignments: 5, status: "Completed" },
    ],
  },
  {
    semester: "Fall 2023",
    courses: [
      { code: "CS-301", title: "Software Engineering", sections: ["A"], students: 52, avgAttendance: 85, quizzes: 3, assignments: 5, status: "Completed" },
      { code: "CS-401", title: "Software Project Management", sections: ["A"], students: 38, avgAttendance: 89, quizzes: 4, assignments: 4, status: "Completed" },
    ],
  },
  {
    semester: "Spring 2023",
    courses: [
      { code: "CS-201", title: "Programming Fundamentals", sections: ["A", "B"], students: 92, avgAttendance: 86, quizzes: 5, assignments: 6, status: "Completed" },
    ],
  },
  {
    semester: "Fall 2022",
    courses: [
      { code: "CS-301", title: "Software Engineering", sections: ["A"], students: 45, avgAttendance: 84, quizzes: 4, assignments: 5, status: "Completed" },
      { code: "CS-302", title: "Computer Network", sections: ["A"], students: 47, avgAttendance: 80, quizzes: 3, assignments: 4, status: "Completed" },
    ],
  },
];

/* =========================================================================
 * 5.  APPEALS — semester+section wise with status, descriptions
 * ----------------------------------------------------------------------- */
export const teacherAppealsRich = [
  { id: 1, student: "Ayesha Khan",  roll: "ADCS-23-101", semester: "Fall 2024", section: "A",
    course: "Software Engineering", code: "CS-301",
    title: "Mid-term marks recheck request",
    description: "I believe Q3 was marked incorrectly. Kindly recheck. The answer matched the rubric provided.",
    date: "2024-12-02", status: "Pending"  },
  { id: 2, student: "Hassan Ali",   roll: "ADCS-23-105", semester: "Fall 2024", section: "A",
    course: "Data Structures", code: "CS-303",
    title: "Assignment 2 missing in portal",
    description: "I submitted Assignment 2 on Nov 20 via email but it does not appear as submitted.",
    date: "2024-11-28", status: "Resolved" },
  { id: 3, student: "Fatima Noor",  roll: "ADCS-23-110", semester: "Fall 2024", section: "B",
    course: "Software Engineering", code: "CS-301",
    title: "Attendance correction — Nov 18",
    description: "I was marked absent on Nov 18 but I attended that class. Please verify with class rep.",
    date: "2024-11-25", status: "Pending"  },
  { id: 4, student: "Bilal Ahmed",  roll: "ADCS-22-088", semester: "Spring 2024", section: "A",
    course: "Programming Fundamentals", code: "CS-201",
    title: "Quiz 3 re-evaluation",
    description: "Quiz 3 grade seems incorrect — I had 8/10 in my own copy.",
    date: "2024-04-15", status: "Resolved" },
  { id: 5, student: "Mahnoor Tariq",roll: "ADCS-23-122", semester: "Fall 2024", section: "B",
    course: "Computer Network", code: "CS-302",
    title: "Final exam date conflict",
    description: "Final exam clashes with another paper — kindly check and adjust.",
    date: "2024-12-01", status: "Under Review" },
  { id: 6, student: "Usman Khalid", roll: "ADCS-23-135", semester: "Fall 2024", section: "A",
    course: "Discrete Structure", code: "MTH-301",
    title: "Marks dispute on Quiz 2",
    description: "My Quiz 2 mark is 12 but the correct rubric awards me 16. Kindly recheck.",
    date: "2024-12-04", status: "Pending"  },
];

/* =========================================================================
 * 6.  PROVOST — Fee management lists (combined Finance + Provost role)
 * ----------------------------------------------------------------------- */
export const provostFeeAnnouncements = [
  { id: "AN-01", title: "Fall 2024 — Semester Fee Notification", batch: "All Batches", program: "ADCS", semester: "All",
    amount: 35000, deadline: "2024-12-25", status: "Active",   issued: "2024-09-01" },
  { id: "AN-02", title: "Mid-Term Examination Fee — Fall 2024",  batch: "2023, 2024", program: "ADCS", semester: "3, 5",
    amount: 2500,  deadline: "2024-10-25", status: "Closed",   issued: "2024-09-30" },
  { id: "AN-03", title: "Final Term Examination Fee — Fall 2024",batch: "All Batches", program: "ADCS", semester: "All",
    amount: 3500,  deadline: "2024-12-30", status: "Active",   issued: "2024-12-01" },
  { id: "AN-04", title: "Spring 2025 — Early Bird Semester Fee", batch: "2024", program: "ADCS", semester: "2, 4",
    amount: 33000, deadline: "2025-02-10", status: "Scheduled",issued: "2024-12-05" },
  { id: "AN-05", title: "Fall 2024 — BS-CS Semester Fee",        batch: "All Batches", program: "BS Computer Science", semester: "All",
    amount: 42000, deadline: "2024-12-28", status: "Active",   issued: "2024-09-03" },
];

// Exam Fee Announcements (Provost) — same style as semester fee
export const provostExamFeeAnnouncements = [
  { id: "EX-01", title: "Mid-Term Examination Fee — Fall 2024",   examType: "Mid Term",   batch: "2023, 2024",  program: "ADCS",                       semester: "3, 5",
    amount: 2500, deadline: "2024-10-25", status: "Closed",    issued: "2024-09-30" },
  { id: "EX-02", title: "Final Term Examination Fee — Fall 2024", examType: "Final Term", batch: "All Batches", program: "ADCS",                       semester: "All",
    amount: 3500, deadline: "2024-12-30", status: "Active",    issued: "2024-12-01" },
  { id: "EX-03", title: "Re-Sit Examination Fee — Spring 2025",   examType: "Re-Sit",     batch: "All Batches", program: "BS Computer Science",        semester: "All",
    amount: 1500, deadline: "2025-02-20", status: "Scheduled", issued: "2024-12-15" },
  { id: "EX-04", title: "Special Mid-Term Fee — Spring 2025",     examType: "Mid Term",   batch: "2023, 2024",  program: "BS Software Engineering",    semester: "3, 5",
    amount: 2500, deadline: "2025-03-25", status: "Scheduled", issued: "2024-12-20" },
];

// Online Exam Management — date sheets (for Exam Controller)
export const onlineExamSchedules = [
  { id: "EXM-001", course: "CS-301 — Software Engineering",   program: "BS Computer Science",       semester: 5, section: "A", type: "Mid Term",   date: "2025-03-12", time: "10:00", duration: "90 min",  proctored: true,  status: "Scheduled", students: 52 },
  { id: "EXM-002", course: "CS-301 — Software Engineering",   program: "BS Computer Science",       semester: 5, section: "B", type: "Mid Term",   date: "2025-03-12", time: "13:00", duration: "90 min",  proctored: true,  status: "Scheduled", students: 48 },
  { id: "EXM-003", course: "CS-302 — Computer Networks",      program: "BS Computer Science",       semester: 4, section: "A", type: "Mid Term",   date: "2025-03-14", time: "10:00", duration: "90 min",  proctored: true,  status: "Scheduled", students: 50 },
  { id: "EXM-004", course: "CS-303 — Data Structures",        program: "BS Software Engineering",   semester: 3, section: "A", type: "Mid Term",   date: "2025-03-15", time: "10:00", duration: "90 min",  proctored: false, status: "Scheduled", students: 55 },
  { id: "EXM-005", course: "CS-304 — Web Engineering",        program: "BS Computer Science",       semester: 5, section: "A", type: "Final Term", date: "2025-05-12", time: "09:00", duration: "120 min", proctored: true,  status: "Published", students: 45 },
  { id: "EXM-006", course: "CS-305 — Operating Systems",      program: "BS Information Technology", semester: 4, section: "A", type: "Final Term", date: "2025-05-14", time: "09:00", duration: "120 min", proctored: true,  status: "Published", students: 47 },
  { id: "EXM-007", course: "MTH-301 — Discrete Structures",   program: "BS Computer Science",       semester: 3, section: "A", type: "Final Term", date: "2025-05-16", time: "13:00", duration: "120 min", proctored: true,  status: "Draft",     students: 48 },
  { id: "EXM-008", course: "ENG-101 — English Composition",   program: "BS Information Technology", semester: 1, section: "A", type: "Mid Term",   date: "2025-03-18", time: "10:00", duration: "60 min",  proctored: false, status: "Scheduled", students: 60 },
];

export const provostFeeApprovals = [
  { id: "AP-001", student: "Ayesha Khan",   roll: "ADCS-23-101", program: "ADCS", batch: "2023", semester: "3",
    amount: 35000, type: "Semester Fee",     status: "Pending",  date: "2024-09-12", method: "EasyPaisa" },
  { id: "AP-002", student: "Hassan Ali",    roll: "ADCS-23-105", program: "ADCS", batch: "2023", semester: "3",
    amount:  2500, type: "Mid-Term Fee",      status: "Approved", date: "2024-10-22", method: "OneLink"  },
  { id: "AP-003", student: "Fatima Noor",   roll: "ADCS-23-110", program: "ADCS", batch: "2023", semester: "3",
    amount: 35000, type: "Semester Fee",     status: "Rejected", date: "2024-09-15", method: "JazzCash", reason: "Invalid challan number" },
  { id: "AP-004", student: "Bilal Ahmed",   roll: "ADCS-22-088", program: "ADCS", batch: "2022", semester: "5",
    amount:  3500, type: "Final Term Fee",    status: "Pending",  date: "2024-12-05", method: "OneLink"  },
  { id: "AP-005", student: "Mahnoor Tariq", roll: "ADCS-23-122", program: "ADCS", batch: "2023", semester: "3",
    amount: 35000, type: "Semester Fee",     status: "Approved", date: "2024-09-10", method: "EasyPaisa"},
  { id: "AP-006", student: "Usman Khalid",  roll: "ADCS-23-135", program: "ADCS", batch: "2023", semester: "3",
    amount: 35000, type: "Semester Fee",     status: "Pending",  date: "2024-09-18", method: "JazzCash" },
];

export const provostRevenueChart = [
  { month: "Jul", revenue: 1.8, target: 2.0 },
  { month: "Aug", revenue: 5.2, target: 5.0 },
  { month: "Sep", revenue: 8.4, target: 8.0 },
  { month: "Oct", revenue: 3.1, target: 3.5 },
  { month: "Nov", revenue: 4.5, target: 4.0 },
  { month: "Dec", revenue: 6.2, target: 6.5 },
];

/* =========================================================================
 * 7.  FOCAL PERSON — Dropped Students
 * ----------------------------------------------------------------------- */
export const droppedStudents = [
  { id: 1, student: "Zainab Iqbal",  roll: "ADCS-22-045", program: "ADCS", batch: "2022", droppedSemester: "Sem 4 — Spring 2024",
    reason: "Medical Emergency",      droppedOn: "2024-04-10", lmsAccess: "Suspended", canResume: true,  resumeFrom: "Semester 4" },
  { id: 2, student: "Ahmed Raza",    roll: "ADCS-22-077", program: "ADCS", batch: "2022", droppedSemester: "Sem 3 — Fall 2023",
    reason: "Financial Hardship",     droppedOn: "2023-11-22", lmsAccess: "Suspended", canResume: true,  resumeFrom: "Semester 3" },
  { id: 3, student: "Sana Yousaf",   roll: "ADCS-21-018", program: "ADCS", batch: "2021", droppedSemester: "Sem 5 — Fall 2023",
    reason: "Family Relocation",      droppedOn: "2023-10-05", lmsAccess: "Restored",  canResume: true,  resumeFrom: "Semester 5" },
  { id: 4, student: "Hamza Sheikh",  roll: "ADCS-22-099", program: "ADCS", batch: "2022", droppedSemester: "Sem 4 — Spring 2024",
    reason: "Academic Probation",     droppedOn: "2024-03-15", lmsAccess: "Suspended", canResume: false, resumeFrom: null },
  { id: 5, student: "Rabia Khan",    roll: "ADCS-23-203", program: "ADCS", batch: "2023", droppedSemester: "Sem 2 — Spring 2024",
    reason: "Personal Reasons",       droppedOn: "2024-04-25", lmsAccess: "Suspended", canResume: true,  resumeFrom: "Semester 2" },
  { id: 6, student: "Faraz Malik",   roll: "ADCS-22-112", program: "ADCS", batch: "2022", droppedSemester: "Sem 4 — Spring 2024",
    reason: "Discipline Issue",       droppedOn: "2024-05-02", lmsAccess: "Permanently Revoked", canResume: false, resumeFrom: null },
];

export const dropReasons = ["Medical Emergency", "Financial Hardship", "Family Relocation", "Academic Probation", "Personal Reasons", "Discipline Issue"];

/* =========================================================================
 * 8.  FOCAL — Discipline / Fines added by Focal Person
 * ----------------------------------------------------------------------- */
export const focalFines = [
  { id: "DF-001", student: "Hassan Ali",   roll: "ADCS-23-105", title: "Plagiarism Penalty", reason: "Assignment 2 — verbatim copy", amount: 5000, deadline: "2024-12-25", issuedOn: "2024-12-01", status: "Pending"  },
  { id: "DF-002", student: "Bilal Ahmed",  roll: "ADCS-22-088", title: "Unauthorized Absence", reason: "Missed 5+ classes without leave",  amount: 2000, deadline: "2024-12-20", issuedOn: "2024-11-25", status: "Paid"     },
  { id: "DF-003", student: "Mahnoor Tariq",roll: "ADCS-23-122", title: "Misconduct in Lab", reason: "Damaged equipment intentionally", amount: 3500, deadline: "2024-12-30", issuedOn: "2024-12-05", status: "Pending"  },
];

/* =========================================================================
 * 9.  FOCAL — Detailed Activity Logs
 * ----------------------------------------------------------------------- */
export const focalActivityLogsRich = [
  { id: 1, actor: "Dr. Muhammad Naeem",  role: "Teacher",  action: "Assignment Uploaded",        subject: "CS-301 — SE",     details: "Sprint Planning Report (15 marks)",         time: "2024-12-09 14:22", category: "assignment", severity: "info" },
  { id: 2, actor: "Dr. Asim Shahzad",    role: "Teacher",  action: "Quiz Created",                 subject: "CS-303 — DS",     details: "Quiz 3 — Trees (25 marks)",                  time: "2024-12-09 11:08", category: "quiz",       severity: "info" },
  { id: 3, actor: "Ayesha Khan",         role: "Student",  action: "Assignment Submitted",         subject: "CS-303 — DS",     details: "Binary Tree Traversal Code",                 time: "2024-12-09 09:42", category: "assignment", severity: "success" },
  { id: 4, actor: "Hassan Ali",          role: "Student",  action: "Quiz Attempted",               subject: "CS-301 — SE",     details: "Quiz 2 — Requirements (scored 17/20)",       time: "2024-12-08 18:30", category: "quiz",       severity: "success" },
  { id: 5, actor: "Dr. Muhammad Zeeshan",role: "Teacher",  action: "Marks Uploaded",               subject: "CS-302 — CN",     details: "Mid-Term marks for Section A (50 students)", time: "2024-12-08 13:15", category: "marks",      severity: "info" },
  { id: 6, actor: "Dr. Muhammad Naeem",  role: "Teacher",  action: "Attendance Marked",            subject: "CS-301 — SE",     details: "Section A — 50/52 present",                  time: "2024-12-08 09:05", category: "attendance", severity: "info" },
  { id: 7, actor: "Fatima Noor",         role: "Student",  action: "Appeal Submitted",             subject: "CS-301 — SE",     details: "Attendance correction — Nov 18",             time: "2024-11-25 16:42", category: "appeal",     severity: "warning" },
  { id: 8, actor: "Dr. Asim Shahzad",    role: "Teacher",  action: "Appeal Resolved",              subject: "CS-303 — DS",     details: "Resolved Hassan Ali's submission issue",     time: "2024-11-29 11:20", category: "appeal",     severity: "success" },
  { id: 9, actor: "Bilal Ahmed",         role: "Student",  action: "Lecture Watched",              subject: "CS-301 — SE",     details: "Agile & Scrum Methodologies (55:12)",        time: "2024-12-07 22:10", category: "lecture",    severity: "info" },
  { id:10, actor: "Dr. Muhammad Naeem",  role: "Teacher",  action: "Lecture Uploaded",             subject: "CS-301 — SE",     details: "Software Testing Strategies (44:18)",        time: "2024-09-30 14:00", category: "lecture",    severity: "info" },
];

/* =========================================================================
 * 10.  FOCAL — Results Analytics (read-only) — semester-wise per subject
 * ----------------------------------------------------------------------- */
export const focalResultsAnalytics = [
  {
    semester: "Fall 2024 — Sem 3",
    courses: [
      { code: "CS-301", title: "Software Engineering",   instructor: "Dr. Muhammad Naeem", students: 52, submitted: 50, avgQuiz: 16.2, avgAssign: 17.8, avgMid: 25.1, avgFinal: 41.6, avgTotal: 100.7, pass: 49, fail: 1 },
      { code: "CS-302", title: "Computer Network",       instructor: "Dr. Muhammad Zeeshan", students: 50, submitted: 48, avgQuiz: 15.5, avgAssign: 16.4, avgMid: 23.2, avgFinal: 39.5, avgTotal: 94.6,  pass: 46, fail: 2 },
      { code: "CS-303", title: "Data Structures",        instructor: "Dr. Asim Shahzad",   students: 55, submitted: 54, avgQuiz: 17.1, avgAssign: 18.0, avgMid: 24.6, avgFinal: 42.4, avgTotal: 102.1, pass: 53, fail: 1 },
      { code: "MTH-301",title: "Discrete Structure",     instructor: "Dr. Muhammad Naeem", students: 48, submitted: 47, avgQuiz: 14.8, avgAssign: 16.5, avgMid: 22.1, avgFinal: 38.2, avgTotal: 91.6,  pass: 44, fail: 3 },
      { code: "MTH-302",title: "Multivariable Calculus", instructor: "Dr. Asim Shahzad",   students: 45, submitted: 44, avgQuiz: 15.0, avgAssign: 17.0, avgMid: 23.8, avgFinal: 40.1, avgTotal: 95.9,  pass: 42, fail: 2 },
      { code: "IS-101", title: "Islamic Studies",        instructor: "Dr. Muhammad Zeeshan", students: 60, submitted: 60, avgQuiz: 17.5, avgAssign: 18.2, avgMid: 25.5, avgFinal: 42.0, avgTotal: 103.2, pass: 60, fail: 0 },
    ],
  },
  {
    semester: "Spring 2024 — Sem 2",
    courses: [
      { code: "CS-201", title: "Programming Fundamentals", instructor: "Dr. Muhammad Naeem", students: 96, submitted: 94, avgQuiz: 16.8, avgAssign: 17.4, avgMid: 24.5, avgFinal: 41.2, avgTotal: 99.9, pass: 91, fail: 3 },
      { code: "CS-202", title: "Object Oriented Prog.",    instructor: "Dr. Asim Shahzad",   students: 92, submitted: 90, avgQuiz: 17.5, avgAssign: 18.0, avgMid: 25.8, avgFinal: 42.5, avgTotal: 103.8,pass: 89, fail: 1 },
    ],
  },
];

/* =========================================================================
 * 11.  EXAM CONTROLLER — UFM cases, absentees, rechecks, gazette etc.
 * ----------------------------------------------------------------------- */
export const examControllerData = {
  absentees: [
    { id: 1, student: "Ayesha Khan",  roll: "ADCS-23-101", course: "CS-301", exam: "Mid-Term", date: "2024-10-28", reason: "Medical (verified)",     status: "Verified" },
    { id: 2, student: "Hassan Ali",   roll: "ADCS-23-105", course: "CS-302", exam: "Mid-Term", date: "2024-10-29", reason: "Family Emergency",       status: "Pending"  },
    { id: 3, student: "Fatima Noor",  roll: "ADCS-23-110", course: "MTH-301",exam: "Mid-Term", date: "2024-10-30", reason: "No reason submitted",    status: "Rejected" },
  ],
  ufmCases: [
    { id: 1, student: "Bilal Ahmed",  roll: "ADCS-22-088", course: "CS-301", exam: "Mid-Term", date: "2024-10-28", evidence: "Mobile phone seen", invigilator: "Mr. Asif Khan", status: "Under Review", severity: "High" },
    { id: 2, student: "Usman Khalid", roll: "ADCS-23-135", course: "CS-303", exam: "Mid-Term", date: "2024-10-30", evidence: "Cheating slip found",invigilator: "Ms. Rabia",     status: "Confirmed",   severity: "Critical" },
    { id: 3, student: "Mahnoor Tariq",roll: "ADCS-23-122", course: "MTH-302",exam: "Mid-Term", date: "2024-10-29", evidence: "Whispering — warning",invigilator: "Mr. Asif Khan", status: "Dismissed",   severity: "Low" },
  ],
  incompleteResults: [
    { id: 1, student: "Ayesha Khan",  roll: "ADCS-23-101", course: "CS-301", missing: "Mid-Term marks", instructor: "Dr. Naeem", status: "Held" },
    { id: 2, student: "Hassan Ali",   roll: "ADCS-23-105", course: "CS-302", missing: "Assignment 3",   instructor: "Dr. Zeeshan", status: "Awaiting Teacher" },
  ],
  rechecks: [
    { id: 1, student: "Fatima Noor",  roll: "ADCS-23-110", course: "CS-301", exam: "Mid-Term", appliedOn: "2024-11-05", fee: 1500, status: "In Progress" },
    { id: 2, student: "Bilal Ahmed",  roll: "ADCS-22-088", course: "MTH-301",exam: "Quiz 2",   appliedOn: "2024-11-08", fee: 1000, status: "Completed", oldMarks: 12, newMarks: 16 },
  ],
  marksCorrections: [
    { id: 1, student: "Usman Khalid", roll: "ADCS-23-135", course: "CS-303", exam: "Mid-Term", requestedBy: "Dr. Asim Shahzad",   old: 22, new: 25, reason: "Calculation error",        status: "Pending" },
    { id: 2, student: "Mahnoor Tariq",roll: "ADCS-23-122", course: "MTH-302",exam: "Quiz 1",   requestedBy: "Dr. Asim Shahzad",   old: 14, new: 17, reason: "Skipped question 3 reviewed",status: "Approved" },
  ],
  examSchedule: [
    { id: 1, course: "CS-301", title: "Software Engineering", exam: "Final-Term", date: "2024-12-28", time: "9:00 AM",  duration: "3h", hall: "Hall A", invigilators: 3 },
    { id: 2, course: "CS-302", title: "Computer Network",     exam: "Final-Term", date: "2024-12-30", time: "9:00 AM",  duration: "3h", hall: "Hall B", invigilators: 3 },
    { id: 3, course: "CS-303", title: "Data Structures",      exam: "Final-Term", date: "2025-01-02", time: "9:00 AM",  duration: "3h", hall: "Hall A", invigilators: 4 },
    { id: 4, course: "MTH-301",title: "Discrete Structure",   exam: "Final-Term", date: "2025-01-05", time: "10:00 AM", duration: "3h", hall: "Hall C", invigilators: 2 },
    { id: 5, course: "MTH-302",title: "Multivariable Calculus",exam:"Final-Term", date: "2025-01-08", time: "10:00 AM", duration: "3h", hall: "Hall B", invigilators: 2 },
  ],
  probationFlags: [
    { id: 1, student: "Bilal Ahmed",   roll: "ADCS-22-088", cgpa: 1.85, semester: "Fall 2024", flag: "Probation", action: "Warning Issued" },
    { id: 2, student: "Hamza Sheikh",  roll: "ADCS-22-099", cgpa: 1.45, semester: "Spring 2024", flag: "Drop Recommended", action: "Dropped" },
  ],
};

/* =========================================================================
 * 12.  QEC — Survey Templates & Faculty/Course evaluation
 * ----------------------------------------------------------------------- */
export const qecSurveys = [
  { id: "SV-01", title: "Faculty Evaluation — Fall 2024",  type: "Student → Teacher",  target: "All Students", deadline: "2025-01-10",
    status: "Active",    responses: 412, totalExpected: 580, anonymous: true,  lockedAfter: "Result Release",
    questions: 18 },
  { id: "SV-02", title: "Course Feedback — Fall 2024",     type: "Student → Course",   target: "All Students", deadline: "2025-01-10",
    status: "Active",    responses: 388, totalExpected: 580, anonymous: true,  lockedAfter: "Result Release",
    questions: 15 },
  { id: "SV-03", title: "Teacher Self-Assessment 2024",     type: "Teacher → Self",     target: "All Teachers", deadline: "2025-01-15",
    status: "Active",    responses: 28,  totalExpected: 42,  anonymous: false, lockedAfter: "Final Result Upload",
    questions: 20 },
  { id: "SV-04", title: "Graduating Students Exit Survey",   type: "Final-Year",         target: "Final Year",   deadline: "2025-02-20",
    status: "Scheduled", responses: 0,   totalExpected: 92,  anonymous: true,  lockedAfter: "—",
    questions: 25 },
  { id: "SV-05", title: "Alumni Engagement Survey 2024",     type: "Alumni",             target: "All Alumni",   deadline: "2025-03-30",
    status: "Scheduled", responses: 0,   totalExpected: 350, anonymous: true,  lockedAfter: "—",
    questions: 15 },
  { id: "SV-06", title: "Employer Satisfaction Survey",      type: "Employer",           target: "Industry Partners", deadline: "2025-04-30",
    status: "Draft",     responses: 0,   totalExpected: 50,  anonymous: false, lockedAfter: "—",
    questions: 18 },
];

export const qecFacultyEval = [
  { id: 1, faculty: "Dr. Muhammad Naeem", department: "CS", courses: 3, avgRating: 4.6, evaluations: 142, trend: "up",   selfRating: 4.4 },
  { id: 2, faculty: "Dr. Asim Shahzad",   department: "CS", courses: 2, avgRating: 4.4, evaluations: 98,  trend: "up",   selfRating: 4.2 },
  { id: 3, faculty: "Dr. Muhammad Zeeshan",department: "CS", courses: 2, avgRating: 4.1, evaluations: 110, trend: "flat", selfRating: 4.3 },
  { id: 4, faculty: "Dr. Saima Riaz",     department: "CS", courses: 1, avgRating: 4.7, evaluations: 56,  trend: "up",   selfRating: 4.5 },
];

export const qecCourseEval = [
  { id: 1, code: "CS-301", title: "Software Engineering",   semester: "Fall 2024", responses: 50, rating: 4.5, ploAttainment: 86, cloAttainment: 88 },
  { id: 2, code: "CS-302", title: "Computer Network",       semester: "Fall 2024", responses: 48, rating: 4.2, ploAttainment: 82, cloAttainment: 84 },
  { id: 3, code: "CS-303", title: "Data Structures",        semester: "Fall 2024", responses: 54, rating: 4.6, ploAttainment: 88, cloAttainment: 90 },
  { id: 4, code: "MTH-301",title: "Discrete Structure",     semester: "Fall 2024", responses: 47, rating: 4.0, ploAttainment: 78, cloAttainment: 81 },
  { id: 5, code: "MTH-302",title: "Multivariable Calculus", semester: "Fall 2024", responses: 44, rating: 4.1, ploAttainment: 80, cloAttainment: 82 },
  { id: 6, code: "IS-101", title: "Islamic Studies",        semester: "Fall 2024", responses: 60, rating: 4.7, ploAttainment: 90, cloAttainment: 92 },
];

export const qecProgramEval = {
  program: "ADCS — Associate Degree in Computer Science",
  cohort: "2023–2025",
  ploAttainment: 84,
  cloAttainment: 87,
  studentSatisfaction: 4.3,
  facultyCount: 18,
  totalStudents: 312,
  graduationRate: 92,
  industryReadiness: 81,
  recommendations: [
    "Strengthen industry collaboration through capstone projects",
    "Introduce AI/ML elective in semester 5",
    "Improve lab infrastructure for networking courses",
    "Enhance soft-skills training in semester 3 & 4",
  ],
  selfAssessmentStatus: "In Progress",
  correctiveActions: 4,
  completedActions: 2,
};

/* =========================================================================
 * 13.  COORDINATOR — Quick Message Templates
 * ----------------------------------------------------------------------- */
export const quickMessageTemplates = [
  { id: "QM-01", title: "Class Cancelled Notice",        body: "Dear students, today's class for {COURSE} is cancelled. New class will be rescheduled and announced soon.",  recipients: "Students of Course" },
  { id: "QM-02", title: "Assignment Deadline Reminder",  body: "This is a friendly reminder — {ASSIGNMENT} for {COURSE} is due on {DATE}. Submit before the deadline.",     recipients: "Students of Course" },
  { id: "QM-03", title: "Quiz Schedule Announcement",    body: "Dear students, {QUIZ} for {COURSE} is scheduled on {DATE}. Please prepare accordingly.",                  recipients: "Students of Course" },
  { id: "QM-04", title: "Attendance Below Threshold",    body: "Dear student, your attendance in {COURSE} has fallen below 75%. Improve attendance to avoid issues.",      recipients: "Specific Students" },
  { id: "QM-05", title: "Fee Deadline Approaching",      body: "Reminder: Your fee challan is due by {DATE}. Pay before the deadline to avoid late fees.",                 recipients: "All Students"       },
  { id: "QM-06", title: "Teacher Substitution Notice",   body: "{ORIGINAL_TEACHER}'s class for {COURSE} will be taken by {SUBSTITUTE_TEACHER} this week.",                  recipients: "Students of Course" },
  { id: "QM-07", title: "Welcome New Semester",          body: "Dear students, welcome to {SEMESTER}. Wishing you a productive semester ahead!",                            recipients: "All Students"       },
  { id: "QM-08", title: "Mid-Term Exam Reminder",        body: "Mid-Term exams begin on {DATE}. Check your date sheet on the LMS portal.",                                 recipients: "All Students"       },
];

/* =========================================================================
 * 14.  COORDINATOR — Existing Courses pool (for Scheme creation)
 * ----------------------------------------------------------------------- */
export const coordinatorCoursePool = [
  { id: "C-101", code: "CS-101",  title: "Programming Fundamentals",      credits: 4, type: "Core" },
  { id: "C-102", code: "CS-201",  title: "Database System",                credits: 4, type: "Core" },
  { id: "C-103", code: "CS-202",  title: "Object Oriented Programming",    credits: 4, type: "Core" },
  { id: "C-104", code: "CS-203",  title: "Digital Logic Design",           credits: 4, type: "Core" },
  { id: "C-105", code: "CS-301",  title: "Software Engineering",           credits: 3, type: "Core" },
  { id: "C-106", code: "CS-302",  title: "Computer Network",               credits: 3, type: "Core" },
  { id: "C-107", code: "CS-303",  title: "Data Structures",                credits: 3, type: "Core" },
  { id: "C-108", code: "CS-303L", title: "Data Structures Lab",            credits: 1, type: "Lab"  },
  { id: "C-109", code: "MTH-101", title: "Calculus",                       credits: 4, type: "Core" },
  { id: "C-110", code: "MTH-201", title: "Linear Algebra",                 credits: 3, type: "Core" },
  { id: "C-111", code: "MTH-301", title: "Discrete Structure",             credits: 3, type: "Core" },
  { id: "C-112", code: "MTH-302", title: "Multivariable Calculus",         credits: 3, type: "Core" },
  { id: "C-113", code: "ENG-101", title: "Functional English",             credits: 3, type: "Gen-Ed" },
  { id: "C-114", code: "ENG-102", title: "Expository Writing",             credits: 3, type: "Gen-Ed" },
  { id: "C-115", code: "IS-101",  title: "Islamic Studies",                credits: 3, type: "Gen-Ed" },
  { id: "C-116", code: "PHY-101", title: "Applied Physics",                credits: 3, type: "Gen-Ed" },
  { id: "C-117", code: "IT-101",  title: "Intro to IT Applications",       credits: 3, type: "Gen-Ed" },
];

/* =========================================================================
 * 15.  COORDINATOR — Course Distribution data (sections × courses × teachers)
 * ----------------------------------------------------------------------- */
export const courseDistributionRich = [
  { id: 1, code: "CS-301", title: "Software Engineering", section: "A", teacher: "Dr. Muhammad Naeem", semester: "Sem 3", batch: "2023", students: 52, status: "Active"   },
  { id: 2, code: "CS-301", title: "Software Engineering", section: "B", teacher: "Dr. Saima Riaz",     semester: "Sem 3", batch: "2023", students: 48, status: "Active"   },
  { id: 3, code: "CS-302", title: "Computer Network",     section: "A", teacher: "Dr. Muhammad Zeeshan",semester: "Sem 3", batch: "2023", students: 50, status: "Active"   },
  { id: 4, code: "CS-303", title: "Data Structures",      section: "A", teacher: "Dr. Asim Shahzad",   semester: "Sem 3", batch: "2023", students: 55, status: "Active"   },
  { id: 5, code: "MTH-301",title: "Discrete Structure",   section: "A", teacher: "Dr. Muhammad Naeem", semester: "Sem 3", batch: "2023", students: 48, status: "Active"   },
  { id: 6, code: "IS-101", title: "Islamic Studies",      section: "A", teacher: "Dr. Muhammad Zeeshan",semester: "Sem 3", batch: "2023", students: 60, status: "Pending"  },
  { id: 7, code: "CS-201", title: "Database System",      section: "A", teacher: "Dr. Asim Shahzad",   semester: "Sem 2", batch: "2024", students: 42, status: "Active"   },
  { id: 8, code: "CS-202", title: "OOP",                  section: "A", teacher: "Dr. Saima Riaz",     semester: "Sem 2", batch: "2024", students: 45, status: "Active"   },
];

/* =========================================================================
 * 16.  COORDINATOR — Section roster (for Student Allocation move)
 * ----------------------------------------------------------------------- */
export const sectionRoster = [
  { section: "Sem 3 — A", students: ["Ayesha Khan", "Hassan Ali", "Bilal Ahmed", "Usman Khalid", "Sara Naveed", "Hamza Tariq"] },
  { section: "Sem 3 — B", students: ["Fatima Noor", "Mahnoor Tariq", "Zara Iqbal", "Ahmed Faraz", "Kashif Riaz"] },
  { section: "Sem 2 — A", students: ["Hira Shahid", "Nadeem Khalid", "Saima Rauf", "Imran Bhatti", "Ali Hassan"] },
  { section: "Sem 2 — B", students: ["Aimen Asif", "Khalid Mehmood", "Wajid Ali", "Komal Ashraf"] },
];

/* =========================================================================
 * 17.  EXAM CONTROLLER — Result hold/release toggles
 * ----------------------------------------------------------------------- */
export const resultReleaseList = [
  { id: 1, course: "CS-301", title: "Software Engineering",   instructor: "Dr. Naeem",   semester: "Fall 2024", status: "Released", releasedOn: "2024-12-05", flagged: 0 },
  { id: 2, course: "CS-302", title: "Computer Network",       instructor: "Dr. Zeeshan", semester: "Fall 2024", status: "Held",     releasedOn: null,         flagged: 2 },
  { id: 3, course: "CS-303", title: "Data Structures",        instructor: "Dr. Asim",    semester: "Fall 2024", status: "Released", releasedOn: "2024-12-06", flagged: 1 },
  { id: 4, course: "MTH-301",title: "Discrete Structure",     instructor: "Dr. Naeem",   semester: "Fall 2024", status: "Held",     releasedOn: null,         flagged: 3 },
  { id: 5, course: "MTH-302",title: "Multivariable Calculus", instructor: "Dr. Asim",    semester: "Fall 2024", status: "Released", releasedOn: "2024-12-06", flagged: 0 },
];

/* =========================================================================
 * Re-exports for convenience (legacy data still used by other pages)
 * ----------------------------------------------------------------------- */
export { recordedLectures, enrolledCourses, assignments, quizzes };

/* =========================================================================
 * 18.  STUDENT-SIDE SURVEY MODULE — survey definitions visible to students
 *      Each survey has typed questions; visible only when QEC enables surveys.
 * ----------------------------------------------------------------------- */
export const studentSurveys = [
  {
    id: "SV-01",
    title: "Faculty Evaluation — Fall 2024",
    description:
      "Help us improve teaching quality by evaluating your course instructors. All responses are completely anonymous.",
    target: "Course Instructor",
    instructor: "Dr. Muhammad Naeem",
    course: "CS-301 · Software Engineering",
    deadline: "2025-01-10",
    estimatedMinutes: 8,
    mandatory: true,
    anonymous: true,
    questions: [
      { id: 1, type: "rating", text: "Instructor demonstrates strong subject knowledge.", scale: 5 },
      { id: 2, type: "rating", text: "Instructor explains concepts clearly with relevant examples.", scale: 5 },
      { id: 3, type: "rating", text: "Lectures are well-organised and easy to follow.", scale: 5 },
      { id: 4, type: "rating", text: "Instructor encourages questions and participation.", scale: 5 },
      { id: 5, type: "rating", text: "Assignments and quizzes are fair and aligned with the syllabus.", scale: 5 },
      { id: 6, type: "rating", text: "Instructor is punctual and accessible during office hours.", scale: 5 },
      { id: 7, type: "rating", text: "Feedback on submitted work is timely and constructive.", scale: 5 },
      { id: 8, type: "text",   text: "What did you appreciate most about this course?" },
      { id: 9, type: "text",   text: "Suggestions to improve teaching or course content." },
    ],
  },
  {
    id: "SV-02",
    title: "Course Feedback — Fall 2024",
    description:
      "Evaluate the course content, learning resources and overall structure.",
    target: "Course",
    instructor: "Dr. Asim Shahzad",
    course: "CS-302 · Computer Network",
    deadline: "2025-01-10",
    estimatedMinutes: 6,
    mandatory: true,
    anonymous: true,
    questions: [
      { id: 1, type: "rating", text: "The course content matches the learning outcomes.", scale: 5 },
      { id: 2, type: "rating", text: "Course resources (lectures, library) are sufficient.", scale: 5 },
      { id: 3, type: "rating", text: "Workload (assignments / quizzes) was reasonable.", scale: 5 },
      { id: 4, type: "rating", text: "The course improved my practical skills.", scale: 5 },
      { id: 5, type: "rating", text: "I would recommend this course to other students.", scale: 5 },
      { id: 6, type: "text",   text: "What topics were the most valuable?" },
      { id: 7, type: "text",   text: "What would you change about the course?" },
    ],
  },
  {
    id: "SV-04",
    title: "Graduating Students Exit Survey",
    description:
      "Mandatory exit survey for final-year students. Your feedback shapes future cohorts.",
    target: "Graduating Students",
    instructor: "—",
    course: "Final Year Cohort",
    deadline: "2025-02-20",
    estimatedMinutes: 12,
    mandatory: true,
    anonymous: true,
    scheduled: true,
    questions: [
      { id: 1, type: "rating", text: "Overall satisfaction with the ADCS program.", scale: 5 },
      { id: 2, type: "rating", text: "Quality of faculty and academic supervision.", scale: 5 },
      { id: 3, type: "rating", text: "Adequacy of laboratory & library resources.", scale: 5 },
      { id: 4, type: "rating", text: "Preparedness for the job market or further studies.", scale: 5 },
      { id: 5, type: "text",   text: "Your overall reflection on AUST ODL." },
    ],
  },
];

/* Mock list of students whose names appear across reports (primary names used heavily) */
export const featuredStudentNames = [
  "FAHAD KHALID",
  "HAMZA YOUSAF",
  "Ayesha Khan",
  "Mahnoor Tariq",
  "Sara Bilal",
  "Zara Iqbal",
];
