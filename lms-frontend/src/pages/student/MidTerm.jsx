import StudentExam from "./StudentExam";

/* Survey restrictions removed — students can attempt papers directly.
   The Surveys module remains visible & accessible from the sidebar
   (Student → Surveys) but completion is now OPTIONAL. */
const MidTerm = () => <StudentExam kind="Mid" />;

export default MidTerm;
