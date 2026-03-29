ALTER TABLE identity.roles 
ADD CONSTRAINT school_role_name_unique UNIQUE (school_id, name);
