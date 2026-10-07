CREATE TABLE finance.Invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,
    student_id UUID NOT NULL,

    amount NUMERIC(10,2) NOT NULL,
    due_date DATE,

    status TEXT DEFAULT 'pending',

    created_at TIMESTAMP DEFAULT now(),

    FOREIGN KEY (school_id) REFERENCES tenancy.schools(id),
    FOREIGN KEY (student_id) REFERENCES student.students(id)
);
