-- Optional: MoE global resources (school_id NULL). Run once after library migration.

INSERT INTO library.resources (
  school_id, category_id, title, title_am, file_type, language, author, edition,
  external_url, status, access_level
)
SELECT
  NULL,
  c.id,
  v.title,
  v.title_am,
  'pdf',
  v.language,
  'MoE Ethiopia',
  '2024 New Curriculum',
  v.external_url,
  'published',
  'school'
FROM (VALUES
  ('Grade 12 Mathematics Student Textbook', 'ክፍል 12 የሒሳብ የተማሪ መፅሐፍ', 'english', 'https://www.moe.gov.et/storage/Books/Grade12Math.pdf'),
  ('Grade 12 English Student Textbook', 'ክፍል 12 የእንግሊዝኛ የተማሪ መፅሐፍ', 'english', 'https://www.moe.gov.et/storage/Books/Grade12English.pdf')
) AS v(title, title_am, language, external_url)
JOIN library.resource_categories c ON c.name = 'Textbook'
WHERE NOT EXISTS (
  SELECT 1 FROM library.resources r
  WHERE r.school_id IS NULL AND r.title = v.title AND r.deleted_at IS NULL
);
