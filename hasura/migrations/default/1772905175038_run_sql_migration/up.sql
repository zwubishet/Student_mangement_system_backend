CREATE TABLE academic.Teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    user_id UUID UNIQUE,
    
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,

    hire_date DATE,
    status TEXT DEFAULT 'active',

    created_at TIMESTAMP DEFAULT now(),

    FOREIGN KEY (school_id) REFERENCES tenancy.schools(id),
    FOREIGN KEY (user_id) REFERENCES identity.users(id)
);
