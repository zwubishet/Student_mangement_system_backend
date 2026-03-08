CREATE TABLE identity.RolePermissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES identity.roles(id),
    permission_id UUID REFERENCES identity.permissions(id)
);
