import TeacherExam from "./TeacherExam";

/* Survey restrictions removed — teachers can manage final-term work directly.
   The Surveys module remains visible & accessible from the teacher's sidebar
   but completion is now OPTIONAL. */
const TeacherFinalTerm = () => <TeacherExam kind="Final" />;

export default TeacherFinalTerm;
