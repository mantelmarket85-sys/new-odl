// Centralised course scheme so Landing & CourseScheme pages stay in sync.
export const courseScheme = [
  {
    sem: 1,
    title: 'Semester One',
    hint: 'Foundations of Computing',
    courses: [
      { name: 'Programming Fundamentals', credits: '3+1', icon: 'fa-code' },
      { name: 'Introduction to IT',       credits: '2+1', icon: 'fa-laptop' },
      { name: 'Applied Physics',          credits: '2+1', icon: 'fa-atom' },
      { name: 'Calculus',                 credits: '3',   icon: 'fa-square-root-variable' },
      { name: 'Functional English',       credits: '3',   icon: 'fa-book-open' },
    ],
  },
  {
    sem: 2,
    title: 'Semester Two',
    hint: 'Building Software Skills',
    courses: [
      { name: 'Expository Writing',          credits: '3',   icon: 'fa-pen-nib' },
      { name: 'Database Systems',            credits: '3+1', icon: 'fa-database' },
      { name: 'Linear Algebra',              credits: '3',   icon: 'fa-vector-square' },
      { name: 'Object Oriented Programming', credits: '3+1', icon: 'fa-diagram-project' },
      { name: 'Digital Logic Design',        credits: '3',   icon: 'fa-microchip' },
    ],
  },
  {
    sem: 3,
    title: 'Semester Three',
    hint: 'Systems &amp; Structures',
    courses: [
      { name: 'Discrete Structures',    credits: '3',   icon: 'fa-shapes' },
      { name: 'Multivariable Calculus', credits: '3',   icon: 'fa-chart-line' },
      { name: 'Software Engineering',   credits: '3',   icon: 'fa-gears' },
      { name: 'Computer Networks',      credits: '2+1', icon: 'fa-network-wired' },
      { name: 'Data Structures',        credits: '3+1', icon: 'fa-sitemap' },
      { name: 'Islamic Studies',        credits: '2',   icon: 'fa-mosque' },
    ],
  },
  {
    sem: 4,
    title: 'Semester Four',
    hint: 'Specialisation &amp; Capstone',
    courses: [
      { name: 'Software Design & Architecture',   credits: '3',   icon: 'fa-cubes' },
      { name: 'Software Construction & Dev',      credits: '3+1', icon: 'fa-hammer' },
      { name: 'Computer Organization & Assembly', credits: '3',   icon: 'fa-memory' },
      { name: 'Information Security',             credits: '2+1', icon: 'fa-shield-halved' },
      { name: 'Artificial Intelligence',          credits: '2+1', icon: 'fa-robot' },
      { name: 'Probability & Statistics',         credits: '3',   icon: 'fa-chart-pie' },
    ],
  },
];

export const whyChooseUs = [
  {
    icon: 'fa-laptop-house',
    title: 'Flexible Online Learning',
    desc: 'Study at your own pace from anywhere in Pakistan. Lectures, notes and assignments are always available on your phone or laptop.',
  },
  {
    icon: 'fa-hand-holding-dollar',
    title: 'Tuition Friendly',
    desc: 'Affordable, transparent fees designed to make quality higher education reachable for working students and rural learners alike.',
  },
  {
    icon: 'fa-certificate',
    title: 'Accredited Programs',
    desc: 'A modern curriculum mapped to industry needs and recognised academic standards, taught by AUST faculty.',
  },
  {
    icon: 'fa-briefcase',
    title: 'Career Focused Courses',
    desc: 'Real projects, hands-on labs and skills employers in software houses, banks and startups are actually hiring for.',
  },
  {
    icon: 'fa-people-group',
    title: 'A Real Student Community',
    desc: 'Join discussion forums, study groups and peer mentoring. Distance learning, but never on your own.',
  },
  {
    icon: 'fa-shield-halved',
    title: 'Fully Online Exams',
    desc: 'Sit your exams from home with secure proctoring, randomised question banks and same-day result publication.',
  },
];

export const alumni = [
  {
    name: 'Qaiser Sultan',
    role: 'Technical Engineer · Aflaak',
    quote:
      'I graduated in BSCS from AUST and now work at Aflaak as a Technical Engineer. The flexible learning model and dedicated faculty gave me the foundation I needed to step straight into the industry.',
    rating: 5,
    initials: 'QS',
  },
  {
    name: 'Hamza Tariq',
    role: 'Software Engineer · Lahore',
    quote:
      'I joined AUST while working full time. Recording lectures and online exams meant I could keep my job and finish my degree without choosing between the two.',
    rating: 5,
    initials: 'HT',
  },
  {
    name: 'Ayesha Khan',
    role: 'Junior Web Developer · Islamabad',
    quote:
      'The Database Systems and OOP courses were genuinely solid. I built two projects from those classes that helped me land my first dev job.',
    rating: 5,
    initials: 'AK',
  },
  {
    name: 'Bilal Ahmed',
    role: 'Data Analyst · Karachi',
    quote:
      'What made the difference was how human the support team was. Whenever I got stuck, someone always replied within a day, sometimes within an hour.',
    rating: 5,
    initials: 'BA',
  },
  {
    name: 'Sadia Iqbal',
    role: 'BS CS Student · Peshawar',
    quote:
      'I love that the exams are fully online and well structured. No travelling for hours to a centre, no long queues, just sit down and write your paper.',
    rating: 5,
    initials: 'SI',
  },
  {
    name: 'Usman Raza',
    role: 'IT Officer · Abbottabad',
    quote:
      'The faculty actually knows the field. The Software Engineering and Information Security modules helped me get promoted at work.',
    rating: 5,
    initials: 'UR',
  },
  {
    name: 'Maryam Saeed',
    role: 'AI Enthusiast · Multan',
    quote:
      'The AI course was honestly the highlight of my final semester. Practical, fun, and finally something I felt I could build on after graduating.',
    rating: 4,
    initials: 'MS',
  },
];

export const stats = [
  { num: 12500, suffix: '+', label: 'Students Enrolled',     icon: 'fa-user-graduate' },
  { num: 24,    suffix: '',  label: 'Courses Offered',       icon: 'fa-book-open-reader' },
  { num: 38000, suffix: '+', label: 'Online Exams Conducted',icon: 'fa-file-pen' },
  { num: 4200,  suffix: '+', label: 'Alumni Network',        icon: 'fa-people-arrows' },
];
