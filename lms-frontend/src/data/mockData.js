// ============= AUST UNIVERSITY INFO =============
export const austInfo = {
  name: "Abbottabad University of Science & Technology",
  shortName: "AUST",
  wing: "Open & Distance Learning (ODL)",
  tagline: "Knowledge · Innovation · Excellence",
  location: "Havelian, Abbottabad, Khyber Pakhtunkhwa, Pakistan",
  established: 2017,
  website: "https://aust.edu.pk",
  email: "odl@aust.edu.pk",
  phone: "+92-992-820 320",
  programOffered: "Associate Degree in Computer Science (ADCS)",
  motto: "Empowering Future Innovators Through Distance Learning",
};

// ============= FACULTY ROSTER (3 official Department of Computer Science teachers) =============
// Central source of truth — used everywhere in the LMS for teacher names / faculty.
export const facultyRoster = [
  {
    id: "FAC-AUST-211",
    name: "Dr. Muhammad Naeem",
    designation: "Chairman, Department of Computer Science",
    department: "Computer Science",
    email: "naeem@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Muhammad+Naeem&background=1e3a8a&color=fff&bold=true&size=256",
  },
  {
    id: "FAC-AUST-212",
    name: "Dr. Asim Shahzad",
    designation: "Associate Professor, Department of Computer Science",
    department: "Computer Science",
    email: "asim.shahzad@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Asim+Shahzad&background=7c3aed&color=fff&bold=true&size=256",
  },
  {
    id: "FAC-AUST-213",
    name: "Dr. Muhammad Zeeshan",
    designation: "Associate Professor, Department of Computer Science",
    department: "Computer Science",
    email: "muhammad.zeeshan@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Muhammad+Zeeshan&background=059669&color=fff&bold=true&size=256",
  },
];

// Convenience accessors
export const F1 = facultyRoster[0]; // Dr. Muhammad Naeem
export const F2 = facultyRoster[1]; // Dr. Asim Shahzad
export const F3 = facultyRoster[2]; // Dr. Muhammad Zeeshan

// ============= STUDENT ROSTER (4 official ODL students) =============
// Central source of truth — used everywhere in the LMS for student names.
export const studentRoster = [
  {
    id: "ADCS-23-101",
    name: "AYESHA KHAN",
    displayName: "Ayesha Khan",
    email: "ayesha.khan@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Ayesha+Khan&background=1e3a8a&color=fff&bold=true&size=256",
  },
  {
    id: "ADCS-23-102",
    name: "FAHAD KHALID",
    displayName: "Fahad Khalid",
    email: "fahad.khalid@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Fahad+Khalid&background=2563eb&color=fff&bold=true&size=256",
  },
  {
    id: "ADCS-23-103",
    name: "HAMZA YOUSAF",
    displayName: "Hamza Yousaf",
    email: "hamza.yousaf@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Hamza+Yousaf&background=059669&color=fff&bold=true&size=256",
  },
  {
    id: "ADCS-23-104",
    name: "MARYAM",
    displayName: "Maryam",
    email: "maryam@aust.edu.pk",
    avatar: "https://ui-avatars.com/api/?name=Maryam&background=db2777&color=fff&bold=true&size=256",
  },
];

export const S1 = studentRoster[0];
export const S2 = studentRoster[1];
export const S3 = studentRoster[2];
export const S4 = studentRoster[3];

// ============= STUDENT DATA (logged-in default) =============
export const studentProfile = {
  id: "ADCS-23-102",
  name: "FAHAD KHALID",
  email: "fahad.khalid@aust.edu.pk",
  phone: "+92-300-2345678",
  cnic: "35202-2345678-9",
  dob: "2003-05-22",
  gender: "Male",
  address: "House 18, Block B, Mansehra Road, Abbottabad",
  program: "Associate Degree in Computer Science",
  programCode: "ADCS",
  university: "Abbottabad University of Science & Technology",
  wing: "Open & Distance Learning",
  session: "Fall 2023",
  semester: 4,
  currentSemester: "Spring 2025",
  enrollmentDate: "2023-09-15",
  studentId: "ADCS-23-102",
  cgpa: 3.62,
  gpa: 3.78,
  completedCredits: 54,
  totalCredits: 72,
  status: "Active",
  avatar: "https://ui-avatars.com/api/?name=Fahad+Khalid&background=1e3a8a&color=fff&bold=true&size=256",
};

// ============= DEGREE PROGRAMS =============
export const degreePrograms = [
  { id: "ADCS", name: "Associate Degree in Computer Science", duration: "2 Years", credits: 72, semesters: 4, students: 1240, fee: "Rs. 35,000 / semester" },
  { id: "BSCS", name: "BS Computer Science", duration: "4 Years", credits: 132, semesters: 8, students: 2150, fee: "Rs. 45,000 / semester" },
  { id: "BSSE", name: "BS Software Engineering", duration: "4 Years", credits: 132, semesters: 8, students: 1820, fee: "Rs. 45,000 / semester" },
  { id: "BBA", name: "Bachelor of Business Administration", duration: "4 Years", credits: 130, semesters: 8, students: 1640, fee: "Rs. 40,000 / semester" },
  { id: "BSE", name: "BS English Literature", duration: "4 Years", credits: 128, semesters: 8, students: 980, fee: "Rs. 32,000 / semester" },
  { id: "MBA", name: "Master of Business Administration", duration: "2 Years", credits: 66, semesters: 4, students: 720, fee: "Rs. 55,000 / semester" },
];

// ============= STUDY SCHEME (ADCS) =============
// Lab courses are explicitly flagged with isLab + labCredits
export const studyScheme = {
  program: "Associate Degree in Computer Science",
  programCode: "ADCS",
  session: "Fall 2023",
  version: "Scheme 2023-A",
  totalCreditHours: 72,
  totalSemesters: 4,
  semesters: [
    {
      semester: 1,
      title: "Semester 1 — Foundation",
      credits: 18,
      subjects: [
        { code: "CS-101", title: "Programming Fundamentals", category: "Core Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "None", status: "Completed", grade: "A" },
        { code: "CS-101L", title: "Programming Fundamentals Lab", category: "Lab Course", subCategory: "Computing", credits: 1, isLab: true, labCredits: 1, prerequisite: "None", status: "Completed", grade: "A" },
        { code: "IT-101", title: "Introduction to Application of Information Technology", category: "Core Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "None", status: "Completed", grade: "A-" },
        { code: "PHY-101", title: "Applied Physics", category: "General Course", subCategory: "Physics", credits: 3, isLab: false, prerequisite: "None", status: "Completed", grade: "B+" },
        { code: "MTH-101", title: "Calculus", category: "Core Course", subCategory: "Mathematics", credits: 4, isLab: false, prerequisite: "None", status: "Completed", grade: "A" },
        { code: "ENG-101", title: "Functional English", category: "General Course", subCategory: "English", credits: 3, isLab: false, prerequisite: "None", status: "Completed", grade: "A-" },
      ],
    },
    {
      semester: 2,
      title: "Semester 2 — Core",
      credits: 18,
      subjects: [
        { code: "ENG-102", title: "Expository Writing", category: "General Course", subCategory: "English", credits: 3, isLab: false, prerequisite: "ENG-101", status: "Completed", grade: "B+" },
        { code: "CS-201", title: "Database System", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-101", status: "Completed", grade: "A" },
        { code: "CS-201L", title: "Database System Lab", category: "Lab Course", subCategory: "Computing", credits: 1, isLab: true, labCredits: 1, prerequisite: "CS-101", status: "Completed", grade: "A" },
        { code: "MTH-201", title: "Linear Algebra", category: "Core Course", subCategory: "Mathematics", credits: 3, isLab: false, prerequisite: "MTH-101", status: "Completed", grade: "A-" },
        { code: "CS-202", title: "Object Oriented Programming", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-101", status: "Completed", grade: "A" },
        { code: "CS-202L", title: "Object Oriented Programming Lab", category: "Lab Course", subCategory: "Computing", credits: 1, isLab: true, labCredits: 1, prerequisite: "CS-101", status: "Completed", grade: "A" },
        { code: "CS-203", title: "Digital Logic Design", category: "Core Course", subCategory: "Computing", credits: 4, isLab: false, prerequisite: "None", status: "Completed", grade: "B+" },
      ],
    },
    {
      semester: 3,
      title: "Semester 3 — Advanced",
      credits: 19,
      subjects: [
        { code: "MTH-301", title: "Discrete Structure", category: "Core Course", subCategory: "Mathematics", credits: 3, isLab: false, prerequisite: "MTH-201", status: "In Progress", grade: "—" },
        { code: "MTH-302", title: "Multivariable Calculus", category: "Core Course", subCategory: "Mathematics", credits: 3, isLab: false, prerequisite: "MTH-101", status: "In Progress", grade: "—" },
        { code: "CS-301", title: "Software Engineering", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-202", status: "In Progress", grade: "—" },
        { code: "CS-302", title: "Computer Network", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "None", status: "In Progress", grade: "—" },
        { code: "CS-303", title: "Data Structures", category: "Core Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-202", status: "In Progress", grade: "—" },
        { code: "CS-303L", title: "Data Structures Lab", category: "Lab Course", subCategory: "Computing", credits: 1, isLab: true, labCredits: 1, prerequisite: "CS-202", status: "In Progress", grade: "—" },
        { code: "IS-101", title: "Islamic Studies", category: "General Course", subCategory: "Islamic Studies", credits: 3, isLab: false, prerequisite: "None", status: "In Progress", grade: "—" },
      ],
    },
    {
      semester: 4,
      title: "Semester 4 — Specialization",
      credits: 17,
      subjects: [
        { code: "CS-401", title: "Software Design and Architecture", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-301", status: "Locked", grade: "—" },
        { code: "CS-402", title: "Software Construction and Development", category: "Major Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-301", status: "Locked", grade: "—" },
        { code: "CS-403", title: "Computer Organization and Assembly Language", category: "Core Course", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-203", status: "Locked", grade: "—" },
        { code: "CS-404", title: "Information Security", category: "Elective", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-302", status: "Locked", grade: "—" },
        { code: "CS-405", title: "Artificial Intelligence", category: "Elective", subCategory: "Computing", credits: 3, isLab: false, prerequisite: "CS-303", status: "Locked", grade: "—" },
        { code: "CS-405L", title: "Artificial Intelligence Lab", category: "Lab Course", subCategory: "Computing", credits: 1, isLab: true, labCredits: 1, prerequisite: "CS-303", status: "Locked", grade: "—" },
        { code: "MTH-401", title: "Probability and Statistics", category: "Core Course", subCategory: "Mathematics", credits: 2, isLab: false, prerequisite: "MTH-201", status: "Locked", grade: "—" },
      ],
    },
  ],
};

// ============= COURSES (Currently Enrolled - Semester 3) =============
export const enrolledCourses = [
  { id: 1, code: "MTH-301", title: "Discrete Structure", instructor: F1.name, credits: 3, isLab: false, progress: 68, color: "from-blue-500 to-indigo-600", icon: "Sigma", lectures: 24, completed: 16, nextClass: "Mon 10:00 AM", students: 48 },
  { id: 2, code: "MTH-302", title: "Multivariable Calculus", instructor: F2.name, credits: 3, isLab: false, progress: 54, color: "from-purple-500 to-pink-600", icon: "Calculator", lectures: 22, completed: 12, nextClass: "Tue 2:00 PM", students: 45 },
  { id: 3, code: "CS-301", title: "Software Engineering", instructor: F1.name, credits: 3, isLab: false, progress: 72, color: "from-emerald-500 to-teal-600", icon: "Code2", lectures: 26, completed: 19, nextClass: "Wed 11:00 AM", students: 52 },
  { id: 4, code: "CS-302", title: "Computer Network", instructor: F3.name, credits: 3, isLab: false, progress: 45, color: "from-amber-500 to-orange-600", icon: "Network", lectures: 24, completed: 11, nextClass: "Thu 9:00 AM", students: 50 },
  { id: 5, code: "CS-303", title: "Data Structures", instructor: F2.name, credits: 3, isLab: false, progress: 60, color: "from-rose-500 to-red-600", icon: "Layers", lectures: 28, completed: 17, nextClass: "Fri 1:00 PM", students: 55 },
  { id: 6, code: "CS-303L", title: "Data Structures Lab", instructor: F2.name, credits: 1, isLab: true, labCredits: 1, progress: 60, color: "from-pink-500 to-fuchsia-600", icon: "TestTube", lectures: 14, completed: 8, nextClass: "Fri 3:00 PM", students: 55 },
  { id: 7, code: "IS-101", title: "Islamic Studies", instructor: F3.name, credits: 3, isLab: false, progress: 80, color: "from-cyan-500 to-blue-600", icon: "BookOpen", lectures: 18, completed: 14, nextClass: "Sat 10:00 AM", students: 60 },
];

// ============= LIVE CLASSES =============
export const liveClasses = [
  { id: 1, course: "Software Engineering", code: "CS-301", instructor: F1.name, date: "2024-12-09", time: "11:00 AM - 12:30 PM", duration: "1h 30m", status: "Upcoming", platform: "BigBlueButton", participants: 52, topic: "Agile & Scrum Methodologies" },
  { id: 2, course: "Discrete Structure", code: "MTH-301", instructor: F1.name, date: "2024-12-09", time: "2:00 PM - 3:30 PM", duration: "1h 30m", status: "Live Now", platform: "BigBlueButton", participants: 48, topic: "Set Theory & Boolean Algebra" },
  { id: 3, course: "Data Structures", code: "CS-303", instructor: F2.name, date: "2024-12-10", time: "1:00 PM - 2:30 PM", duration: "1h 30m", status: "Upcoming", platform: "BigBlueButton", participants: 55, topic: "Linked Lists & Stacks" },
  { id: 4, course: "Computer Network", code: "CS-302", instructor: F3.name, date: "2024-12-10", time: "9:00 AM - 10:30 AM", duration: "1h 30m", status: "Upcoming", platform: "BigBlueButton", participants: 50, topic: "OSI Model — Layers Deep Dive" },
  { id: 5, course: "Multivariable Calculus", code: "MTH-302", instructor: F2.name, date: "2024-12-08", time: "2:00 PM - 3:30 PM", duration: "1h 30m", status: "Completed", platform: "BigBlueButton", participants: 45, topic: "Partial Derivatives" },
  { id: 6, course: "Islamic Studies", code: "IS-101", instructor: F3.name, date: "2024-12-11", time: "10:00 AM - 11:00 AM", duration: "1h", status: "Upcoming", platform: "BigBlueButton", participants: 60, topic: "Quranic Ethics in Modern Society" },
];

// ============= RECORDED LECTURES =============
export const recordedLectures = [
  { id: 1, course: "Software Engineering", code: "CS-301", title: "Introduction to SDLC", instructor: F1.name, duration: "45:22", views: 215, date: "2024-09-15", youtubeId: "I7zKnZAdkrM", progress: 100, thumbnail: "https://img.youtube.com/vi/I7zKnZAdkrM/maxresdefault.jpg" },
  { id: 2, course: "Software Engineering", code: "CS-301", title: "Requirements Engineering", instructor: F1.name, duration: "52:10", views: 198, date: "2024-09-22", youtubeId: "GR4f-1Y_4qE", progress: 80, thumbnail: "https://img.youtube.com/vi/GR4f-1Y_4qE/maxresdefault.jpg" },
  { id: 3, course: "Data Structures", code: "CS-303", title: "Arrays & Memory Allocation", instructor: F2.name, duration: "48:30", views: 234, date: "2024-09-18", youtubeId: "8hly31xKli0", progress: 100, thumbnail: "https://img.youtube.com/vi/8hly31xKli0/maxresdefault.jpg" },
  { id: 4, course: "Data Structures", code: "CS-303", title: "Linked Lists Explained", instructor: F2.name, duration: "55:14", views: 210, date: "2024-09-25", youtubeId: "njTh_OwMljA", progress: 65, thumbnail: "https://img.youtube.com/vi/njTh_OwMljA/maxresdefault.jpg" },
  { id: 5, course: "Discrete Structure", code: "MTH-301", title: "Logic & Propositions", instructor: F1.name, duration: "42:55", views: 187, date: "2024-09-12", youtubeId: "xTNG3FA-9Lw", progress: 100, thumbnail: "https://img.youtube.com/vi/xTNG3FA-9Lw/maxresdefault.jpg" },
  { id: 6, course: "Computer Network", code: "CS-302", title: "Networking Basics & Topologies", instructor: F3.name, duration: "50:40", views: 195, date: "2024-09-20", youtubeId: "qiQR5rTSshw", progress: 45, thumbnail: "https://img.youtube.com/vi/qiQR5rTSshw/maxresdefault.jpg" },
  { id: 7, course: "Multivariable Calculus", code: "MTH-302", title: "Vectors in 3D Space", instructor: F2.name, duration: "47:20", views: 165, date: "2024-09-14", youtubeId: "fNk_zzaMoSs", progress: 100, thumbnail: "https://img.youtube.com/vi/fNk_zzaMoSs/maxresdefault.jpg" },
  { id: 8, course: "Islamic Studies", code: "IS-101", title: "Pillars of Islam", instructor: F3.name, duration: "38:10", views: 220, date: "2024-09-16", youtubeId: "8sgycukafqQ", progress: 100, thumbnail: "https://img.youtube.com/vi/8sgycukafqQ/maxresdefault.jpg" },
];

// ============= ASSIGNMENTS =============
export const assignments = [
  { id: 1, title: "ER Diagram for Library Management System", course: "Software Engineering", code: "CS-301", dueDate: "2024-12-15", status: "Pending", marks: 20, submittedDate: null, description: "Design a complete ER diagram for a library management system with at least 8 entities.", attachments: 0 },
  { id: 2, title: "Linked List Implementation in C++", course: "Data Structures", code: "CS-303", dueDate: "2024-12-12", status: "Submitted", marks: 25, obtained: 23, submittedDate: "2024-12-08", description: "Implement singly, doubly, and circular linked lists with all standard operations.", attachments: 2 },
  { id: 3, title: "Proof using Mathematical Induction", course: "Discrete Structure", code: "MTH-301", dueDate: "2024-12-18", status: "Pending", marks: 15, submittedDate: null, description: "Solve 5 problems using mathematical induction.", attachments: 0 },
  { id: 4, title: "Network Topology Comparison Report", course: "Computer Network", code: "CS-302", dueDate: "2024-12-20", status: "Pending", marks: 20, submittedDate: null, description: "Compare star, mesh, ring, and bus topologies with diagrams.", attachments: 0 },
  { id: 5, title: "Triple Integrals — Problem Set", course: "Multivariable Calculus", code: "MTH-302", dueDate: "2024-12-10", status: "Graded", marks: 20, obtained: 18, submittedDate: "2024-12-05", description: "Solve given triple integral problems.", attachments: 1 },
  { id: 6, title: "Reflective Essay on Quranic Ethics", course: "Islamic Studies", code: "IS-101", dueDate: "2024-12-22", status: "Pending", marks: 10, submittedDate: null, description: "Write a 1500-word reflective essay.", attachments: 0 },
];

// ============= QUIZZES =============
export const quizzes = [
  { id: 1, title: "Quiz 2 — SDLC Models", course: "Software Engineering", code: "CS-301", duration: 15, questions: 10, totalMarks: 20, attempts: 1, maxAttempts: 1, status: "Available", deadline: "2024-12-14 11:59 PM" },
  { id: 2, title: "Quiz 2 — Stacks & Queues", course: "Data Structures", code: "CS-303", duration: 20, questions: 15, totalMarks: 30, attempts: 0, maxAttempts: 1, status: "Available", deadline: "2024-12-16 11:59 PM" },
  { id: 3, title: "Quiz 1 — Set Theory", course: "Discrete Structure", code: "MTH-301", duration: 15, questions: 10, totalMarks: 20, attempts: 1, maxAttempts: 1, status: "Completed", obtained: 18, deadline: "2024-11-30" },
  { id: 4, title: "Quiz 1 — OSI Model", course: "Computer Network", code: "CS-302", duration: 20, questions: 12, totalMarks: 25, attempts: 1, maxAttempts: 1, status: "Completed", obtained: 22, deadline: "2024-11-28" },
  { id: 5, title: "Quiz 1 — Vectors", course: "Multivariable Calculus", code: "MTH-302", duration: 15, questions: 10, totalMarks: 20, attempts: 1, maxAttempts: 1, status: "Completed", obtained: 16, deadline: "2024-11-25" },
];

// ============= ATTENDANCE =============
export const attendanceData = [
  { code: "MTH-301", course: "Discrete Structure", total: 18, present: 16, absent: 2, percentage: 89 },
  { code: "MTH-302", course: "Multivariable Calculus", total: 16, present: 13, absent: 3, percentage: 81 },
  { code: "CS-301", course: "Software Engineering", total: 20, present: 19, absent: 1, percentage: 95 },
  { code: "CS-302", course: "Computer Network", total: 18, present: 14, absent: 4, percentage: 78 },
  { code: "CS-303", course: "Data Structures", total: 22, present: 20, absent: 2, percentage: 91 },
  { code: "IS-101", course: "Islamic Studies", total: 14, present: 13, absent: 1, percentage: 93 },
];

// ============= RESULTS =============
// Marks distribution (per subject — total 100):
//   Quiz       /10
//   Assignment /10
//   Mid Term   /30
//   Final Term /50
export const semesterResults = [
  {
    semester: "Semester 1 - Fall 2023",
    gpa: 3.72,
    credits: 17,
    subjects: [
      { code: "CS-101", title: "Programming Fundamentals", credits: 4, quiz: 9,  assignment: 10, midterm: 27, final: 45, total: 91, grade: "A",  gpa: 4.0, status: "Pass" },
      { code: "IT-101", title: "Intro to IT Applications",  credits: 3, quiz: 9,  assignment: 9,  midterm: 26, final: 42, total: 86, grade: "A",  gpa: 4.0, status: "Pass" },
      { code: "PHY-101", title: "Applied Physics",          credits: 3, quiz: 7,  assignment: 8,  midterm: 23, final: 38, total: 76, grade: "B+", gpa: 3.3, status: "Pass" },
      { code: "MTH-101", title: "Calculus",                 credits: 4, quiz: 10, assignment: 10, midterm: 28, final: 46, total: 94, grade: "A+", gpa: 4.0, status: "Pass" },
      { code: "ENG-101", title: "Functional English",       credits: 3, quiz: 8,  assignment: 9,  midterm: 25, final: 42, total: 84, grade: "A-", gpa: 3.7, status: "Pass" },
    ],
  },
  {
    semester: "Semester 2 - Spring 2024",
    gpa: 3.55,
    credits: 18,
    subjects: [
      { code: "ENG-102", title: "Expository Writing",          credits: 3, quiz: 8,  assignment: 9,  midterm: 24, final: 40, total: 81, grade: "A-", gpa: 3.7, status: "Pass" },
      { code: "CS-201", title: "Database System",              credits: 4, quiz: 9,  assignment: 10, midterm: 27, final: 44, total: 90, grade: "A",  gpa: 4.0, status: "Pass" },
      { code: "MTH-201", title: "Linear Algebra",              credits: 3, quiz: 9,  assignment: 9,  midterm: 25, final: 42, total: 85, grade: "A",  gpa: 4.0, status: "Pass" },
      { code: "CS-202", title: "Object Oriented Programming", credits: 4, quiz: 10, assignment: 10, midterm: 28, final: 45, total: 93, grade: "A+", gpa: 4.0, status: "Pass" },
      { code: "CS-203", title: "Digital Logic Design",         credits: 4, quiz: 7,  assignment: 9,  midterm: 23, final: 39, total: 78, grade: "B+", gpa: 3.3, status: "Pass" },
    ],
  },
];

// ============= ANNOUNCEMENTS =============
export const announcements = [
  { id: 1, title: "Mid-term Exam Schedule Released", body: "Mid-term exam schedule for Fall 2024 is now available. Please check your student portal.", author: "Examination Department", date: "2024-12-05", category: "Exams", important: true },
  { id: 2, title: "Library will remain closed on Friday", body: "Due to system maintenance, the central library will be closed on Friday, Dec 13.", author: "Library Admin", date: "2024-12-04", category: "General", important: false },
  { id: 3, title: "Semester Fee Deadline — Dec 25", body: "Final reminder: Semester fee must be paid before Dec 25, 2024.", author: "Finance Office", date: "2024-12-03", category: "Finance", important: true },
  { id: 4, title: "Tech Fest 2024 Registration Open", body: "Annual tech fest registration is now open. Win exciting prizes!", author: "Student Affairs", date: "2024-12-01", category: "Events", important: false },
  { id: 5, title: "New AI Course Added — Spring 2025", body: "We have introduced a new elective: Deep Learning with PyTorch.", author: "Academic Office", date: "2024-11-28", category: "Academics", important: false },
];

// ============= FEE / ACCOUNT BOOK =============
export const feeData = {
  currentSemester: {
    title: "Semester 3 - Fall 2024",
    challanNo: "CH-2024-FA-00142",
    totalFee: 35000,
    paidAmount: 20000,
    remaining: 15000,
    dueDate: "2024-12-25",
    lastDate: "2025-01-05",
    lateFee: 2000,
    status: "Partially Paid",
  },
  history: [
    { id: 1, semester: "Semester 1 - Fall 2023", challanNo: "CH-2023-FA-00142", amount: 35000, paid: 35000, date: "2023-09-10", method: "EasyPaisa", status: "Paid" },
    { id: 2, semester: "Semester 2 - Spring 2024", challanNo: "CH-2024-SP-00142", amount: 35000, paid: 35000, date: "2024-01-15", method: "JazzCash", status: "Paid" },
    { id: 3, semester: "Semester 3 - Fall 2024 (Partial)", challanNo: "CH-2024-FA-00142", amount: 20000, paid: 20000, date: "2024-09-12", method: "OneLink", status: "Paid" },
  ],
};

// ============= STICKY NOTES =============
export const stickyNotesData = [
  { id: 1, title: "Final Exam Prep", body: "Revise data structures chapters 5-8 before Dec 20", color: "yellow", reminder: "2024-12-15", category: "Exam" },
  { id: 2, title: "Submit Assignment", body: "ER diagram assignment for SE — Due Dec 15", color: "pink", reminder: "2024-12-14", category: "Assignment" },
  { id: 3, title: "Group Study Session", body: "Meet with study group at library — Sat 4 PM", color: "blue", reminder: "2024-12-14", category: "Personal" },
  { id: 4, title: "Pay Semester Fee", body: "Remaining Rs. 15,000 before Dec 25", color: "green", reminder: "2024-12-24", category: "Finance" },
  { id: 5, title: "Watch Recorded Lecture", body: "Computer Network — OSI Model Deep Dive", color: "purple", reminder: "2024-12-12", category: "Study" },
  { id: 6, title: "Quiz Tomorrow", body: "Software Engineering Quiz 2 — Be prepared!", color: "orange", reminder: "2024-12-13", category: "Quiz" },
];

// ============= TEACHER DATA =============
export const teacherProfile = {
  id: F1.id,
  name: F1.name,
  email: F1.email,
  designation: F1.designation,
  department: F1.department,
  experience: "16 years",
  subjects: 4,
  students: 215,
  avatar: F1.avatar,
};

// ============= TEACHER COURSES (with isLab + labCredits) =============
export const teacherCourses = [
  { id: 1, code: "CS-301", title: "Software Engineering", students: 52, lectures: 26, assignments: 4, quizzes: 3, section: "A", isLab: false, credits: 3 },
  { id: 2, code: "CS-301", title: "Software Engineering", students: 48, lectures: 26, assignments: 4, quizzes: 3, section: "B", isLab: false, credits: 3 },
  { id: 3, code: "CS-303L", title: "Data Structures Lab", students: 55, lectures: 14, assignments: 6, quizzes: 2, section: "A", isLab: true, credits: 1, labCredits: 1 },
  { id: 4, code: "CS-401", title: "Software Design & Architecture", students: 60, lectures: 22, assignments: 3, quizzes: 2, section: "A", isLab: false, credits: 3 },
  { id: 5, code: "CS-402", title: "Software Construction & Development", students: 55, lectures: 24, assignments: 3, quizzes: 2, section: "A", isLab: false, credits: 3 },
  { id: 6, code: "CS-405L", title: "Artificial Intelligence Lab", students: 50, lectures: 12, assignments: 5, quizzes: 2, section: "A", isLab: true, credits: 1, labCredits: 1 },
];

// Combined list of all courses across the program — used by Course Library upload form,
// course pickers, etc. Each entry exposes code + title + isLab + credits so dropdowns can
// display: "CS-301 — Software Engineering" / "CS-305L — Operating Systems Lab (Lab · 1 CH)"
export const allCourses = (() => {
  const seen = new Set();
  const list = [];
  studyScheme.semesters.forEach((sem) => {
    sem.subjects.forEach((s) => {
      if (seen.has(s.code)) return;
      seen.add(s.code);
      list.push({
        code: s.code,
        title: s.title,
        isLab: !!s.isLab,
        credits: s.credits || 0,
        labCredits: s.labCredits || (s.isLab ? s.credits : 0),
        semester: sem.semester,
        category: s.category,
      });
    });
  });
  return list;
})();

// ============= ADMIN DATA =============
export const adminStats = {
  totalStudents: 8420,
  totalTeachers: 246,
  totalCourses: 142,
  totalDegrees: 18,
  activeEnrollments: 7820,
  feesCollected: 245000000,
  pendingFees: 38000000,
  liveClassesToday: 64,
};

export const teachersList = [
  { id: F1.id, name: F1.name, department: F1.department, designation: F1.designation, subjects: 4, students: 215, status: "Active" },
  { id: F2.id, name: F2.name, department: F2.department, designation: F2.designation, subjects: 3, students: 178, status: "Active" },
  { id: F3.id, name: F3.name, department: F3.department, designation: F3.designation, subjects: 3, students: 195, status: "Active" },
];

// ============= CHART DATA =============
export const gpaChartData = [
  { semester: "Sem 1", gpa: 3.72 },
  { semester: "Sem 2", gpa: 3.55 },
  { semester: "Sem 3", gpa: 3.78 },
];

export const attendanceChartData = [
  { month: "Sep", percentage: 92 },
  { month: "Oct", percentage: 88 },
  { month: "Nov", percentage: 85 },
  { month: "Dec", percentage: 89 },
];

export const performanceData = [
  { subject: "Discrete", quiz: 18, assignment: 17, midterm: 26 },
  { subject: "Calculus", quiz: 16, assignment: 18, midterm: 24 },
  { subject: "SE", quiz: 19, assignment: 19, midterm: 28 },
  { subject: "Network", quiz: 22, assignment: 16, midterm: 25 },
  { subject: "DS", quiz: 23, assignment: 18, midterm: 27 },
  { subject: "Islamic", quiz: 0, assignment: 0, midterm: 0 },
];

// ============= SCHEDULE =============
export const weeklySchedule = [
  { day: "Monday", classes: [
    { time: "10:00 - 11:30", course: "Discrete Structure", code: "MTH-301", type: "Live", instructor: F1.name },
    { time: "2:00 - 3:30", course: "Data Structures", code: "CS-303", type: "Lab", instructor: F2.name },
  ]},
  { day: "Tuesday", classes: [
    { time: "9:00 - 10:30", course: "Multivariable Calc.", code: "MTH-302", type: "Live", instructor: F2.name },
    { time: "11:00 - 12:30", course: "Computer Network", code: "CS-302", type: "Live", instructor: F3.name },
  ]},
  { day: "Wednesday", classes: [
    { time: "11:00 - 12:30", course: "Software Engineering", code: "CS-301", type: "Live", instructor: F1.name },
    { time: "1:00 - 2:30", course: "Islamic Studies", code: "IS-101", type: "Recorded", instructor: F3.name },
  ]},
  { day: "Thursday", classes: [
    { time: "9:00 - 10:30", course: "Computer Network", code: "CS-302", type: "Live", instructor: F3.name },
    { time: "2:00 - 3:30", course: "Data Structures", code: "CS-303", type: "Live", instructor: F2.name },
  ]},
  { day: "Friday", classes: [
    { time: "10:00 - 11:30", course: "Discrete Structure", code: "MTH-301", type: "Live", instructor: F1.name },
    { time: "1:00 - 2:30", course: "Data Structures", code: "CS-303", type: "Live", instructor: F2.name },
  ]},
  { day: "Saturday", classes: [
    { time: "10:00 - 11:00", course: "Islamic Studies", code: "IS-101", type: "Live", instructor: F3.name },
  ]},
];

// ============= TESTIMONIALS =============
export const testimonials = [
  { id: 1, name: "Ayesha Khan", role: "ADCS Student", avatar: S1.avatar, text: "AUST ODL has transformed how I learn. Live classes feel just like real classrooms, and the recorded lectures are a lifesaver during exams!" },
  { id: 2, name: "Fahad Khalid", role: "ADCS Student", avatar: S2.avatar, text: "The best LMS I've ever used. The dashboard is intuitive, assignments are easy to submit, and CGPA tracking helps me stay focused." },
  { id: 3, name: F1.name, role: "Senior Faculty", avatar: F1.avatar, text: "As a teacher, I appreciate the seamless BigBlueButton integration and how easy it is to manage students, attendance, and grading." },
  { id: 4, name: "Maryam", role: "ADCS Student", avatar: S4.avatar, text: "Studying from home with AUST ODL feels premium. The interface is beautiful and everything is well-organized." },
];

// ============= FAQ =============
export const faqs = [
  { q: "What is AUST ODL LMS?", a: "AUST ODL is a complete Open and Distance Learning platform offering live classes, recorded lectures, assignments, quizzes, and full university-level academic management." },
  { q: "How do I enroll in a course?", a: "Register an account, choose your degree program, and self-enroll in semester courses from the student dashboard." },
  { q: "Can I attend classes from anywhere?", a: "Yes! All live classes are powered by BigBlueButton and can be accessed from any device with an internet connection." },
  { q: "How do I pay my semester fee?", a: "We accept EasyPaisa, JazzCash, OneLink, and Bank Transfer. Payment options are available in the Account Book section." },
  { q: "Is there a recorded lecture library?", a: "Absolutely! Every live class is recorded and uploaded as an organized YouTube playlist for each course." },
  { q: "Can I download my result transcript?", a: "Yes, official transcripts can be downloaded as PDF directly from the Results module." },
];

// ============= TEACHER CARDS (for student dashboard) =============
// Rating field removed per spec — student dashboard cards no longer show teacher ratings.
export const teacherCards = [
  {
    id: "T1",
    teacherId: F1.id,
    teacher: F1.name,
    designation: F1.designation,
    avatar: F1.avatar,
    subject: "Software Engineering",
    courseCode: "CS-301",
    credits: 3,
    isLab: false,
    color: "from-blue-500 to-indigo-600",
    status: "active",
    nextClass: "Tomorrow, 10:00 AM",
    progress: 68,
    assignments: 4,
    quizzes: 3,
    attendance: 92,
    announcements: 5,
  },
  {
    id: "T2",
    teacherId: F2.id,
    teacher: F2.name,
    designation: F2.designation,
    avatar: F2.avatar,
    subject: "Data Structures",
    courseCode: "CS-303",
    credits: 3,
    isLab: false,
    color: "from-purple-500 to-fuchsia-600",
    status: "active",
    nextClass: "Today, 2:00 PM",
    progress: 75,
    assignments: 5,
    quizzes: 4,
    attendance: 88,
    announcements: 3,
  },
  {
    id: "T3",
    teacherId: F3.id,
    teacher: F3.name,
    designation: F3.designation,
    avatar: F3.avatar,
    subject: "Computer Network",
    courseCode: "CS-302",
    credits: 3,
    isLab: false,
    color: "from-emerald-500 to-teal-600",
    status: "live",
    nextClass: "Live Now",
    progress: 62,
    assignments: 3,
    quizzes: 5,
    attendance: 95,
    announcements: 4,
  },
  {
    id: "T4",
    teacherId: F2.id,
    teacher: F2.name,
    designation: F2.designation,
    avatar: F2.avatar,
    subject: "Data Structures Lab",
    courseCode: "CS-303L",
    credits: 1,
    isLab: true,
    labCredits: 1,
    color: "from-orange-500 to-rose-500",
    status: "active",
    nextClass: "Friday, 3:00 PM",
    progress: 60,
    assignments: 6,
    quizzes: 2,
    attendance: 90,
    announcements: 2,
  },
  {
    id: "T5",
    teacherId: F1.id,
    teacher: F1.name,
    designation: F1.designation,
    avatar: F1.avatar,
    subject: "Discrete Structure",
    courseCode: "MTH-301",
    credits: 3,
    isLab: false,
    color: "from-cyan-500 to-sky-600",
    status: "active",
    nextClass: "Saturday, 9:00 AM",
    progress: 55,
    assignments: 3,
    quizzes: 2,
    attendance: 86,
    announcements: 2,
  },
  {
    id: "T6",
    teacherId: F3.id,
    teacher: F3.name,
    designation: F3.designation,
    avatar: F3.avatar,
    subject: "Islamic Studies",
    courseCode: "IS-101",
    credits: 3,
    isLab: false,
    color: "from-pink-500 to-rose-600",
    status: "active",
    nextClass: "Monday, 12:00 PM",
    progress: 70,
    assignments: 4,
    quizzes: 3,
    attendance: 89,
    announcements: 3,
  },
];

// ============= DIGITAL / COURSE LIBRARY =============
// Videos removed per spec. Resources now expose:
//   type       : "books" | "pdf" | "slides" | "notes" | "assignments"
//   week       : 1..14   (used by the new week-wise filter)
//   courseCode : full course code  (CS-301, CS-303L, etc.)
//   courseTitle: full course title (Software Engineering, ...)
export const libraryCategories = [
  { id: "all", label: "All Resources", icon: "Library" },
  { id: "books", label: "Books", icon: "BookOpen" },
  { id: "slides", label: "Slides", icon: "Presentation" },
  { id: "notes", label: "Notes", icon: "NotebookPen" },
  { id: "pdf", label: "PDFs", icon: "FileText" },
  { id: "assignments", label: "Assignments", icon: "ClipboardList" },
];

export const libraryResources = [
  // Books
  { id: "L1", title: "Software Engineering: A Practitioner's Approach", author: "Roger S. Pressman", type: "books", week: 1, category: "Software Engineering", courseCode: "CS-301", courseTitle: "Software Engineering", cover: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=560&fit=crop", size: "12.4 MB", pages: 982, downloads: 1240, views: 4520, rating: 4.8, trending: true, featured: true, uploadedAt: "2025-04-15", uploadedBy: F1.name },
  { id: "L2", title: "Database System Concepts (7th Edition)", author: "Silberschatz, Korth, Sudarshan", type: "books", week: 1, category: "Database Systems", courseCode: "CS-201", courseTitle: "Database System", cover: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=560&fit=crop", size: "18.2 MB", pages: 1376, downloads: 982, views: 3210, rating: 4.9, trending: true, featured: true, uploadedAt: "2025-04-10", uploadedBy: F2.name },
  { id: "L3", title: "Data Structures and Algorithms in C++ (2nd Edition)", author: "Adam Drozdek", type: "books", week: 1, category: "Data Structures", courseCode: "CS-303", courseTitle: "Data Structures", cover: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=400&h=560&fit=crop", size: "15.8 MB", pages: 1024, downloads: 768, views: 2890, rating: 4.7, featured: true, uploadedAt: "2025-04-08", uploadedBy: F2.name },
  { id: "L8", title: "Computer Networking: A Top-Down Approach", author: "Kurose & Ross", type: "books", week: 1, category: "Computer Network", courseCode: "CS-302", courseTitle: "Computer Network", cover: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&h=560&fit=crop", size: "9.2 MB", pages: 412, downloads: 612, views: 2240, rating: 4.7, featured: true, uploadedAt: "2025-04-22", uploadedBy: F3.name },

  // Slides
  { id: "L5", title: "SDLC Models — Week 2 Slides", author: F1.name, type: "slides", week: 2, category: "Software Engineering", courseCode: "CS-301", courseTitle: "Software Engineering", cover: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=560&fit=crop", size: "4.5 MB", pages: 72, downloads: 528, views: 1640, rating: 4.7, uploadedAt: "2025-05-05", uploadedBy: F1.name },
  { id: "L10", title: "Software Design Patterns — Week 5 Slides", author: F1.name, type: "slides", week: 5, category: "Software Engineering", courseCode: "CS-301", courseTitle: "Software Engineering", cover: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&h=560&fit=crop", size: "6.4 MB", pages: 96, downloads: 384, views: 1320, rating: 4.6, uploadedAt: "2025-04-18", uploadedBy: F1.name },
  { id: "L12", title: "Stacks & Queues — Week 3 Slides", author: F2.name, type: "slides", week: 3, category: "Data Structures", courseCode: "CS-303", courseTitle: "Data Structures", cover: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=560&fit=crop", size: "3.2 MB", pages: 54, downloads: 290, views: 980, rating: 4.6, uploadedAt: "2025-04-26", uploadedBy: F2.name },
  { id: "L13", title: "OSI Model — Week 2 Slides", author: F3.name, type: "slides", week: 2, category: "Computer Network", courseCode: "CS-302", courseTitle: "Computer Network", cover: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=560&fit=crop", size: "5.1 MB", pages: 68, downloads: 318, views: 1102, rating: 4.7, uploadedAt: "2025-04-30", uploadedBy: F3.name },

  // Notes
  { id: "L14", title: "Requirements Engineering — Week 3 Notes", author: F1.name, type: "notes", week: 3, category: "Software Engineering", courseCode: "CS-301", courseTitle: "Software Engineering", cover: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=560&fit=crop", size: "1.6 MB", pages: 28, downloads: 245, views: 920, rating: 4.6, uploadedAt: "2025-05-02", uploadedBy: F1.name },
  { id: "L15", title: "Linked Lists — Week 4 Notes", author: F2.name, type: "notes", week: 4, category: "Data Structures", courseCode: "CS-303", courseTitle: "Data Structures", cover: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=560&fit=crop", size: "1.2 MB", pages: 22, downloads: 312, views: 1140, rating: 4.7, trending: true, uploadedAt: "2025-05-04", uploadedBy: F2.name },
  { id: "L16", title: "TCP/IP Stack — Week 4 Notes", author: F3.name, type: "notes", week: 4, category: "Computer Network", courseCode: "CS-302", courseTitle: "Computer Network", cover: "https://images.unsplash.com/photo-1581090700227-1e37b190418e?w=400&h=560&fit=crop", size: "1.4 MB", pages: 26, downloads: 178, views: 712, rating: 4.5, uploadedAt: "2025-05-06", uploadedBy: F3.name },

  // PDFs
  { id: "L4", title: "Normalization & 3NF — Week 6 Reference", author: F2.name, type: "pdf", week: 6, category: "Database Systems", courseCode: "CS-201", courseTitle: "Database System", cover: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=560&fit=crop", size: "2.1 MB", pages: 38, downloads: 412, views: 1180, rating: 4.6, trending: true, uploadedAt: "2025-05-12", uploadedBy: F2.name },
  { id: "L7", title: "TCP/IP Reference Notes — Week 5", author: F3.name, type: "pdf", week: 5, category: "Computer Network", courseCode: "CS-302", courseTitle: "Computer Network", cover: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=560&fit=crop", size: "3.8 MB", pages: 64, downloads: 240, views: 920, rating: 4.5, uploadedAt: "2025-05-01", uploadedBy: F3.name },
  { id: "L9", title: "Discrete Math Practice Problems — Week 7", author: F1.name, type: "pdf", week: 7, category: "Discrete Structure", courseCode: "MTH-301", courseTitle: "Discrete Structure", cover: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=560&fit=crop", size: "1.8 MB", pages: 48, downloads: 198, views: 720, rating: 4.4, uploadedAt: "2025-04-28", uploadedBy: F1.name },

  // Assignments
  { id: "L17", title: "Assignment 1 — SDLC Comparative Study (Week 2)", author: F1.name, type: "assignments", week: 2, category: "Software Engineering", courseCode: "CS-301", courseTitle: "Software Engineering", cover: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=400&h=560&fit=crop", size: "0.8 MB", pages: 4, downloads: 412, views: 1620, rating: 4.7, trending: true, uploadedAt: "2025-04-20", uploadedBy: F1.name },
  { id: "L18", title: "Assignment 2 — Linked List Implementation (Week 4)", author: F2.name, type: "assignments", week: 4, category: "Data Structures", courseCode: "CS-303", courseTitle: "Data Structures", cover: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=560&fit=crop", size: "0.9 MB", pages: 5, downloads: 322, views: 1280, rating: 4.6, uploadedAt: "2025-04-29", uploadedBy: F2.name },
  { id: "L19", title: "Assignment 3 — Network Topology Report (Week 3)", author: F3.name, type: "assignments", week: 3, category: "Computer Network", courseCode: "CS-302", courseTitle: "Computer Network", cover: "https://images.unsplash.com/photo-1518432031352-d6fc5c10da5a?w=400&h=560&fit=crop", size: "1.1 MB", pages: 6, downloads: 198, views: 854, rating: 4.4, uploadedAt: "2025-05-03", uploadedBy: F3.name },
];

// Available weeks for the Course Library week-wise filter
export const libraryWeeks = Array.from({ length: 14 }, (_, i) => i + 1);

// ============= APPEALS =============
export const appealCategories = [
  "Marks Re-checking", "Attendance Correction", "Fee Issue", "Technical Issue", "Examination Issue", "Course Withdrawal", "Other"
];

export const studentAppeals = [
  { id: "AP-2025-018", title: "Quiz 3 marks re-checking request", category: "Marks Re-checking", recipient: "teacher", recipientName: F1.name, subject: "CS-301 Software Engineering", description: "I believe Q3 was marked incorrectly. The answer follows the SDLC framework taught in lecture 5.", status: "Under Review", createdAt: "2025-05-10", updatedAt: "2025-05-12", attachments: 2, response: "Reviewing your submission. Will update within 48 hours." },
  { id: "AP-2025-014", title: "Attendance not marked for live class on May 5", category: "Attendance Correction", recipient: "teacher", recipientName: F2.name, subject: "CS-303 Data Structures", description: "I attended the live class on May 5 but my attendance was marked absent. Screenshot attached.", status: "Resolved", createdAt: "2025-05-06", updatedAt: "2025-05-07", attachments: 1, response: "Verified from BBB logs. Attendance updated to Present." },
  { id: "AP-2025-009", title: "Semester fee payment receipt not reflecting", category: "Fee Issue", recipient: "admin", recipientName: "Finance Office", subject: "Spring 2025 Fee", description: "Submitted fee via JazzCash on April 28 but it still shows pending in my account book.", status: "Resolved", createdAt: "2025-04-30", updatedAt: "2025-05-02", attachments: 1, response: "Payment verified and approved. Receipt issued." },
  { id: "AP-2025-005", title: "Unable to join BigBlueButton live class", category: "Technical Issue", recipient: "admin", recipientName: "IT Support", subject: "CS-302 Computer Network", description: "Get a 'meeting not found' error when joining live classes on weekends.", status: "Pending", createdAt: "2025-05-13", updatedAt: "2025-05-13", attachments: 3, response: null },
  { id: "AP-2025-002", title: "Final exam date conflict", category: "Examination Issue", recipient: "admin", recipientName: "Examinations Office", subject: "CS-301 Software Engineering", description: "Two papers scheduled on the same day. Requesting one to be rescheduled.", status: "Rejected", createdAt: "2025-05-08", updatedAt: "2025-05-09", attachments: 0, response: "Schedule cannot be changed at this stage. Please contact your dept." },
];

// ============= BADGES & ACHIEVEMENTS =============
export const studentBadges = [
  { id: "B1", title: "Top Performer", description: "Scored 90%+ in 3 consecutive quizzes", icon: "Trophy", color: "from-amber-400 to-orange-500", earned: true, date: "2025-04-22", rarity: "Gold" },
  { id: "B2", title: "Perfect Attendance", description: "100% attendance in one full month", icon: "CalendarCheck", color: "from-emerald-400 to-teal-500", earned: true, date: "2025-03-30", rarity: "Silver" },
  { id: "B3", title: "Early Bird", description: "Submitted 10 assignments before deadline", icon: "Sunrise", color: "from-sky-400 to-blue-500", earned: true, date: "2025-04-10", rarity: "Silver" },
  { id: "B4", title: "Knowledge Seeker", description: "Downloaded 50+ library resources", icon: "BookMarked", color: "from-purple-400 to-fuchsia-500", earned: true, date: "2025-04-28", rarity: "Bronze" },
  { id: "B5", title: "Quiz Master", description: "Maintain 85%+ average across all quizzes", icon: "Brain", color: "from-rose-400 to-pink-500", earned: false, progress: 78, rarity: "Gold" },
  { id: "B6", title: "Discussion Leader", description: "Post 25+ helpful messages in groups", icon: "MessageCircle", color: "from-cyan-400 to-blue-500", earned: false, progress: 60, rarity: "Silver" },
  { id: "B7", title: "Streak Champion", description: "Login 30 days in a row", icon: "Flame", color: "from-orange-400 to-red-500", earned: false, progress: 70, rarity: "Gold" },
  { id: "B8", title: "Semester Star", description: "Achieve 3.7+ GPA in current semester", icon: "Star", color: "from-yellow-400 to-amber-500", earned: false, progress: 95, rarity: "Platinum" },
];

export const certificates = [
  { id: "C1", title: "Software Engineering Mastery", issuedAt: "2025-01-15", issuedBy: "AUST ODL", courseCode: "CS-301", grade: "A" },
  { id: "C2", title: "Database Systems Excellence", issuedAt: "2024-09-20", issuedBy: "AUST ODL", courseCode: "CS-201", grade: "A-" },
];

// ============= AI INSIGHTS =============
export const aiInsights = {
  riskLevel: "Low",
  riskScore: 18,
  predictedCGPA: 3.74,
  strongSubjects: [
    { subject: "Software Engineering", code: "CS-301", confidence: 92 },
    { subject: "Data Structures", code: "CS-303", confidence: 88 },
  ],
  weakSubjects: [
    { subject: "Computer Network", code: "CS-302", confidence: 64, recommendation: "Review chapters 4-6 and watch the TCP/IP walkthrough" },
    { subject: "Discrete Structure", code: "MTH-301", confidence: 70, recommendation: "Practice combinatorics problems from the resource library" },
  ],
  recommendations: [
    { title: "Read: Linked Lists Week 4 Notes", reason: "Helps with upcoming DS quiz on May 22", type: "pdf" },
    { title: "Read: Database Normalization Notes", reason: "Trending among top performers in CS-201", type: "pdf" },
    { title: "Attend: SDLC Live Discussion", reason: "Reinforces your strongest course", type: "live" },
    { title: "Practice: Networking MCQs", reason: "Improve your weakest topic before the mid-term", type: "quiz" },
  ],
  studyPattern: {
    peakHour: "9:00 PM - 11:00 PM",
    bestDay: "Wednesday",
    avgDailyMinutes: 142,
    weeklyChange: "+18%",
  },
};

// ============= ACTIVITY TIMELINE =============
export const activityTimeline = [
  // Software Engineering CS-301
  { id: "A1", type: "assignment", subject: "Software Engineering", courseCode: "CS-301", title: "Uploaded Assignment 3 — ER Diagram for Library System", time: "5 hours ago", icon: "Upload", color: "blue" },
  { id: "A2", type: "quiz", subject: "Software Engineering", courseCode: "CS-301", title: "Quiz 2 — SDLC Models submitted", score: "18/20", time: "1 day ago", icon: "FileQuestion", color: "emerald" },
  { id: "A3", type: "live", subject: "Software Engineering", courseCode: "CS-301", title: "Attended Live Class — Agile Development", duration: "1h 30m", time: "2 days ago", icon: "Video", color: "violet" },
  { id: "A4", type: "attendance", subject: "Software Engineering", courseCode: "CS-301", title: "Marked present in Week 7 class", time: "2 days ago", icon: "UserCheck", color: "emerald" },
  { id: "A5", type: "result", subject: "Software Engineering", courseCode: "CS-301", title: "Quiz 1 graded — 17/20 (85%)", score: "17/20", time: "1 week ago", icon: "CheckCircle2", color: "emerald" },
  { id: "A6", type: "notification", subject: "Software Engineering", courseCode: "CS-301", title: "New announcement: Mid-term schedule released", time: "1 week ago", icon: "Bell", color: "amber" },

  // Database Systems CS-201
  { id: "A7", type: "live", subject: "Database System", courseCode: "CS-201", title: "Attended Live Class — Database Normalization", duration: "1h 25m", time: "Yesterday", icon: "Video", color: "violet" },
  { id: "A8", type: "assignment", subject: "Database System", courseCode: "CS-201", title: "Submitted Assignment 4 — SQL Queries", time: "2 days ago", icon: "Upload", color: "blue" },
  { id: "A9", type: "exam", subject: "Database System", courseCode: "CS-201", title: "Mid-term scheduled for 25 May", time: "3 days ago", icon: "FileText", color: "pink" },
  { id: "A10", type: "grade", subject: "Database System", courseCode: "CS-201", title: "Assignment 3 graded — 9/10", score: "9/10", time: "5 days ago", icon: "Award", color: "emerald" },

  // Data Structures CS-303
  { id: "A11", type: "quiz", subject: "Data Structures", courseCode: "CS-303", title: "Submitted Quiz 4 — Linked Lists", score: "19/20", time: "2 hours ago", icon: "FileQuestion", color: "emerald" },
  { id: "A12", type: "live", subject: "Data Structures", courseCode: "CS-303", title: "Live Class — Stacks & Queues", duration: "1h 15m", time: "Yesterday", icon: "Video", color: "violet" },
  { id: "A13", type: "submission", subject: "Data Structures Lab", courseCode: "CS-303L", title: "Lab 5 — Linked List Implementation submitted", time: "3 days ago", icon: "FileCheck", color: "blue" },
  { id: "A14", type: "attendance", subject: "Data Structures", courseCode: "CS-303", title: "Attendance: 92% this semester", time: "4 days ago", icon: "UserCheck", color: "emerald" },

  // Computer Network CS-302
  { id: "A18", type: "exam", subject: "Computer Network", courseCode: "CS-302", title: "Mid-term scheduled — 25 May at 9:00 AM", time: "2 days ago", icon: "FileText", color: "pink" },
  { id: "A19", type: "live", subject: "Computer Network", courseCode: "CS-302", title: "Attended Live Class — TCP/IP Stack", duration: "1h 20m", time: "3 days ago", icon: "Video", color: "violet" },
  { id: "A20", type: "grade", subject: "Computer Network", courseCode: "CS-302", title: "Lab Report 2 graded — 8/10", score: "8/10", time: "1 week ago", icon: "Award", color: "emerald" },
];

// ============= CALENDAR EVENTS =============
export const calendarEvents = [
  { id: "E1", title: "Quiz 5 — Software Engineering", type: "quiz", date: "2025-05-18", time: "10:00 AM", color: "blue", subject: "CS-301" },
  { id: "E2", title: "Assignment 4 Due — Database System", type: "assignment", date: "2025-05-20", time: "11:59 PM", color: "amber", subject: "CS-201" },
  { id: "E3", title: "Live Class — Data Structures", type: "live", date: "2025-05-19", time: "2:00 PM", color: "rose", subject: "CS-303" },
  { id: "E4", title: "Mid-Term Exam — Networks", type: "exam", date: "2025-05-25", time: "9:00 AM", color: "purple", subject: "CS-302" },
  { id: "E5", title: "Quiz 4 — Discrete Structure", type: "quiz", date: "2025-05-22", time: "11:00 AM", color: "blue", subject: "MTH-301" },
  { id: "E6", title: "Live Class — Discrete Math", type: "live", date: "2025-05-21", time: "12:00 PM", color: "rose", subject: "MTH-301" },
  { id: "E7", title: "Fee Submission Deadline", type: "deadline", date: "2025-05-30", time: "5:00 PM", color: "red", subject: "Finance" },
  { id: "E8", title: "Result Announcement — Spring 2025", type: "result", date: "2025-06-15", time: "10:00 AM", color: "emerald", subject: "All" },
];

// ============= SMART NOTIFICATIONS =============
export const smartNotifications = [
  { id: "N1", title: "Quiz starts in 1 hour", description: "CS-301 Software Engineering Quiz 5", type: "quiz", urgent: true, time: "Just now", icon: "AlarmClock", color: "rose" },
  { id: "N2", title: "Live class joining soon", description: `Data Structures with ${F2.name} at 2:00 PM`, type: "live", urgent: true, time: "30 mins ago", icon: "Video", color: "amber" },
  { id: "N3", title: "Assignment graded", description: "Computer Network A3 — 8.5/10", type: "result", urgent: false, time: "2 hours ago", icon: "CheckCircle2", color: "emerald" },
  { id: "N4", title: "Study group invite", description: "FAHAD KHALID added you to 'CS-301 Final Prep' group", type: "message", urgent: false, time: "3 hours ago", icon: "Users", color: "indigo" },
  { id: "N5", title: "Notes shared", description: "HAMZA YOUSAF shared 'OSI Model Notes.pdf' with you", type: "library", urgent: false, time: "4 hours ago", icon: "BookOpen", color: "blue" },
  { id: "N6", title: "Appeal status updated", description: "Your appeal AP-2025-018 is now Under Review", type: "appeal", urgent: false, time: "1 day ago", icon: "ShieldCheck", color: "violet" },
  { id: "N7", title: "Fee deadline reminder", description: "Spring 2025 fee due in 5 days", type: "fee", urgent: false, time: "1 day ago", icon: "Wallet", color: "orange" },
];

// ============= MESSAGES (Slack-style) =============
export const messageChannels = [
  { id: "M1", name: "CS-301 — Software Engineering", type: "channel", subject: "CS-301", members: 42, online: 18, unread: 3, lastMessage: `${F1.name}: Please review chapter 5`, lastTime: "2m", color: "blue" },
  { id: "M2", name: "CS-201 — Database System", type: "channel", subject: "CS-201", members: 38, online: 12, unread: 0, lastMessage: "Ayesha Khan: When is the assignment due?", lastTime: "1h", color: "purple" },
  { id: "M3", name: "CS-303 — Data Structures", type: "channel", subject: "CS-303", members: 35, online: 8, unread: 7, lastMessage: `${F2.name}: Live class starting in 30m`, lastTime: "5m", color: "emerald" },
  { id: "M4", name: "CS-302 — Computer Network", type: "channel", subject: "CS-302", members: 40, online: 14, unread: 0, lastMessage: "Fahad Khalid: Anyone got the OSI notes?", lastTime: "3h", color: "orange" },
  { id: "M5", name: "ADCS Class of 2025", type: "channel", subject: "General", members: 124, online: 38, unread: 12, lastMessage: "Maryam: Study group tonight at 9 PM", lastTime: "12m", color: "cyan" },
];

export const directMessages = [
  { id: "DM1", name: F1.name, role: "Teacher", avatar: F1.avatar, online: true, unread: 1, lastMessage: "I've reviewed your appeal", lastTime: "5m" },
  { id: "DM2", name: F2.name, role: "Teacher", avatar: F2.avatar, online: true, unread: 0, lastMessage: "Great work on the project!", lastTime: "1h" },
  { id: "DM3", name: "Hamza Yousaf", role: "Student", avatar: S3.avatar, online: true, unread: 2, lastMessage: "Can you share your notes?", lastTime: "10m" },
  { id: "DM4", name: "Fahad Khalid", role: "Student", avatar: S2.avatar, online: false, unread: 0, lastMessage: "Thanks for the help!", lastTime: "Yesterday" },
  { id: "DM5", name: "IT Support", role: "Coordinator", avatar: "https://ui-avatars.com/api/?name=IT+Support&background=ea580c&color=fff&size=128", online: true, unread: 0, lastMessage: "Issue resolved", lastTime: "2d" },
];

export const sampleConversation = [
  { id: 1, sender: F1.name, senderRole: "Teacher", time: "10:14 AM", text: "Good morning everyone! Today's live class will cover SDLC models in depth. Please join on time.", own: false },
  { id: 2, sender: "FAHAD KHALID", senderRole: "Student", time: "10:16 AM", text: "Good morning sir! Will the recorded version be available afterwards?", own: true },
  { id: 3, sender: F1.name, senderRole: "Teacher", time: "10:17 AM", text: "Yes, the recording will be uploaded to the digital library within 2 hours of the class.", own: false },
  { id: 4, sender: "Hamza Yousaf", senderRole: "Student", time: "10:18 AM", text: "Sir, will we discuss the upcoming quiz syllabus today?", own: false },
  { id: 5, sender: F1.name, senderRole: "Teacher", time: "10:19 AM", text: "Yes, the last 15 minutes are reserved for Quiz 5 walkthrough. 📘", own: false },
  { id: 6, sender: "FAHAD KHALID", senderRole: "Student", time: "10:20 AM", text: "Thank you sir! See you at 2 PM.", own: true },
];

// ============= TEACHER MESSAGES =============
export const teacherMessageChannels = [
  { id: "TM1", name: "CS-301 — Software Engineering", type: "channel", subject: "CS-301 · Section A", members: 52, online: 21, unread: 4, lastMessage: "Ayesha Khan: Sir, will the deadline be extended?", lastTime: "3m", color: "blue" },
  { id: "TM2", name: "CS-301 — Software Engineering", type: "channel", subject: "CS-301 · Section B", members: 48, online: 16, unread: 0, lastMessage: "Hamza Yousaf: Quiz solutions uploaded?", lastTime: "20m", color: "purple" },
  { id: "TM3", name: "CS-401 — Software Design", type: "channel", subject: "CS-401 · Section A", members: 60, online: 24, unread: 2, lastMessage: "Fahad Khalid: Thanks for the lecture today!", lastTime: "1h", color: "emerald" },
  { id: "TM4", name: "CS-402 — Software Construction", type: "channel", subject: "CS-402 · Section A", members: 55, online: 19, unread: 0, lastMessage: "Maryam: Github repo updated", lastTime: "2h", color: "orange" },
  { id: "TM5", name: "Faculty Lounge", type: "channel", subject: "Internal · Teachers only", members: 18, online: 7, unread: 1, lastMessage: `${F2.name}: Mid-term schedule shared`, lastTime: "45m", color: "cyan" },
];

export const teacherDirectMessages = [
  { id: "TDM1", name: "Prof. Sarah Ahmed", role: "Coordinator", avatar: "https://ui-avatars.com/api/?name=Sarah+Ahmed&background=7c3aed&color=fff&size=128", online: true, unread: 1, lastMessage: "Could you submit the marks by Friday?", lastTime: "8m" },
  { id: "TDM2", name: F2.name, role: "Teacher", avatar: F2.avatar, online: true, unread: 0, lastMessage: "Sharing the rubric we discussed.", lastTime: "30m" },
  { id: "TDM3", name: "Ayesha Khan", role: "Student", avatar: S1.avatar, online: true, unread: 2, lastMessage: "Sir, I need clarification on the assignment", lastTime: "12m" },
  { id: "TDM4", name: "Fahad Khalid", role: "Student", avatar: S2.avatar, online: false, unread: 0, lastMessage: "Thank you sir, understood now.", lastTime: "Yesterday" },
  { id: "TDM5", name: "Hamza Yousaf", role: "Student", avatar: S3.avatar, online: true, unread: 0, lastMessage: "Submitted the appeal.", lastTime: "2h" },
  { id: "TDM6", name: "Maryam", role: "Student", avatar: S4.avatar, online: false, unread: 0, lastMessage: "Assignment submitted. Thank you.", lastTime: "3d" },
];

export const teacherSampleConversation = [
  { id: 1, sender: "Ayesha Khan", senderRole: "Student", time: "09:45 AM", text: "Good morning sir, I wanted to ask about Assignment 3.", own: false },
  { id: 2, sender: F1.name, senderRole: "Teacher", time: "09:47 AM", text: "Good morning. Sure, what's the question?", own: true },
  { id: 3, sender: "Ayesha Khan", senderRole: "Student", time: "09:48 AM", text: "Question 4 — should we use UML class diagrams or sequence diagrams to demonstrate the design pattern?", own: false },
  { id: 4, sender: F1.name, senderRole: "Teacher", time: "09:50 AM", text: "Great question. Use both — class diagram for structure and sequence diagram for interaction flow. It helps grade the design thinking more holistically.", own: true },
  { id: 5, sender: "Ayesha Khan", senderRole: "Student", time: "09:51 AM", text: "Understood, sir. Thank you so much! 🙏", own: false },
  { id: 6, sender: F1.name, senderRole: "Teacher", time: "09:52 AM", text: "You're welcome. Looking forward to your submission. Don't forget the deadline is Sunday 11:59 PM.", own: true },
];

// ============= FEE PAYMENT RECORDS =============
export const feePayments = [
  { id: "FP-2025-04", semester: "Spring 2025", amount: 35000, dueDate: "2025-05-30", paidDate: "2025-04-28", method: "JazzCash", trxId: "JC2025042812345", status: "Approved", challanUrl: "#", reviewer: "Finance Office", reviewedAt: "2025-04-29", remarks: "Payment verified. Receipt issued." },
  { id: "FP-2024-09", semester: "Fall 2024", amount: 35000, dueDate: "2024-10-15", paidDate: "2024-10-10", method: "Bank Transfer", trxId: "HBL2024101087654", status: "Approved", challanUrl: "#", reviewer: "Finance Office", reviewedAt: "2024-10-11", remarks: "Approved." },
  { id: "FP-2024-04", semester: "Spring 2024", amount: 32000, dueDate: "2024-04-30", paidDate: "2024-04-25", method: "EasyPaisa", trxId: "EP2024042554321", status: "Approved", challanUrl: "#", reviewer: "Finance Office", reviewedAt: "2024-04-26", remarks: "Approved." },
  { id: "FP-2023-09", semester: "Fall 2023", amount: 32000, dueDate: "2023-10-15", paidDate: "2023-10-12", method: "1Link", trxId: "1L2023101212345", status: "Approved", challanUrl: "#", reviewer: "Finance Office", reviewedAt: "2023-10-13", remarks: "Approved." },
];

// ============= ADMIN PENDING FEE APPROVALS =============
export const pendingFeeApprovals = [
  { id: "PA-001", student: "Fahad Khalid", studentId: "ADCS-23-102", semester: "Spring 2025", amount: 35000, method: "EasyPaisa", trxId: "EP2025051345621", uploadedAt: "2025-05-13", status: "Pending" },
  { id: "PA-002", student: "Hamza Yousaf", studentId: "ADCS-23-103", semester: "Spring 2025", amount: 35000, method: "JazzCash", trxId: "JC2025051298765", uploadedAt: "2025-05-12", status: "Pending" },
  { id: "PA-003", student: "Maryam", studentId: "ADCS-23-104", semester: "Spring 2025", amount: 35000, method: "Bank Transfer", trxId: "HBL2025051187654", uploadedAt: "2025-05-11", status: "Under Review" },
  { id: "PA-004", student: "Ayesha Khan", studentId: "ADCS-23-101", semester: "Spring 2025", amount: 35000, method: "1Link", trxId: "1L2025051054321", uploadedAt: "2025-05-10", status: "Pending" },
];

// ============= BIGBLUEBUTTON SESSIONS =============
export const liveSessions = [
  { id: "LS1", title: "SDLC Models — Lecture 8", subject: "Software Engineering", code: "CS-301", teacher: F1.name, startTime: "2025-05-15 10:00", duration: 90, status: "live", participants: 28, capacity: 50, recordingAvailable: false, meetingId: "AUST-CS301-080" },
  { id: "LS2", title: "ER Diagrams — Lecture 9", subject: "Database System", code: "CS-201", teacher: F2.name, startTime: "2025-05-15 14:00", duration: 90, status: "upcoming", participants: 0, capacity: 50, recordingAvailable: false, meetingId: "AUST-CS201-090" },
  { id: "LS3", title: "Linked Lists — Lecture 10", subject: "Data Structures", code: "CS-303", teacher: F2.name, startTime: "2025-05-15 16:00", duration: 90, status: "upcoming", participants: 0, capacity: 50, recordingAvailable: false, meetingId: "AUST-CS303-100" },
  { id: "LS4", title: "Software Design Patterns Deep Dive", subject: "Software Engineering", code: "CS-301", teacher: F1.name, startTime: "2025-05-14 11:00", duration: 90, status: "completed", participants: 38, capacity: 50, recordingAvailable: true, meetingId: "AUST-CS301-070" },
  { id: "LS5", title: "TCP/IP Layer Model", subject: "Computer Network", code: "CS-302", teacher: F3.name, startTime: "2025-05-14 09:00", duration: 90, status: "completed", participants: 32, capacity: 50, recordingAvailable: true, meetingId: "AUST-CS302-060" },
];

// ============= ENROLLMENT TREND (for admin) =============
export const enrollmentTrendData = [
  { month: "Jul", students: 980 },
  { month: "Aug", students: 1120 },
  { month: "Sep", students: 1340 },
  { month: "Oct", students: 1280 },
  { month: "Nov", students: 1410 },
  { month: "Dec", students: 1520 },
  { month: "Jan", students: 1640 },
  { month: "Feb", students: 1820 },
  { month: "Mar", students: 1920 },
  { month: "Apr", students: 2080 },
  { month: "May", students: 2240 },
];

// ============= REVENUE DATA (admin) =============
export const revenueData = [
  { month: "Jan", revenue: 5.2, expenses: 3.1 },
  { month: "Feb", revenue: 5.8, expenses: 3.3 },
  { month: "Mar", revenue: 6.1, expenses: 3.5 },
  { month: "Apr", revenue: 6.8, expenses: 3.6 },
  { month: "May", revenue: 7.2, expenses: 3.8 },
];
