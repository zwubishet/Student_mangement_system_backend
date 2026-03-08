CREATE TABLE finance.StudentInvoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES student.students(id),
    fee_structure_id UUID REFERENCES finance.FeeStructures(id),
    total_amount NUMERIC,
    status TEXT
);
