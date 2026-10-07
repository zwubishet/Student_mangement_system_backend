CREATE TABLE operations.Attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES operations.AttendanceSessions(id),
    student_id UUID REFERENCES student.students(id),
    status TEXT
);
