CREATE TABLE finance.FeeStructureItems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_structure_id UUID REFERENCES finance.FeeStructures(id),
    name TEXT,
    amount NUMERIC
);
