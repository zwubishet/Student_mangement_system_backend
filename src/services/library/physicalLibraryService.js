import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { librarySchemaReady } from './resourceService.js';

const notReady = () => {
  throw new AppError(
    'Resource library is not installed. Run backend migrations (npm run migrate:psql).',
    503,
    ERROR_CODES.INVALID_OPERATION
  );
};

export const listBooks = async (schoolId, { search, page = 1, limit = 30 } = {}) => {
  if (!(await librarySchemaReady())) notReady();

  const params = [schoolId];
  let where = 'school_id = $1 AND deleted_at IS NULL';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (title ILIKE $${params.length} OR author ILIKE $${params.length})`;
  }

  const pageLimit = Math.min(100, Number(limit) || 30);
  const offset = (Math.max(1, Number(page)) - 1) * pageLimit;

  const [countRes, listRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM library.library_books lb WHERE ${where.replace(/\bschool_id\b/g, 'lb.school_id').replace(/\bdeleted_at\b/g, 'lb.deleted_at')}`, params),
    query(
      `SELECT lb.*, sub.name AS subject_name, g.name AS grade_name
       FROM library.library_books lb
       LEFT JOIN academic.subjects sub ON sub.id = lb.subject_id
       LEFT JOIN academic.grades g ON g.id = lb.grade_id
       WHERE lb.school_id = $1 AND lb.deleted_at IS NULL
       ${search ? `AND (lb.title ILIKE $2 OR lb.author ILIKE $2)` : ''}
       ORDER BY lb.title
       LIMIT ${pageLimit} OFFSET ${offset}`,
      params
    ),
  ]);

  return { items: listRes.rows, total: countRes.rows[0]?.total || 0, page: Number(page), limit: pageLimit };
};

export const upsertBook = async (schoolId, body, bookId = null) => {
  if (!(await librarySchemaReady())) notReady();

  const {
    title, title_am, author, isbn, publisher, published_year, category,
    subject_id, grade_id, language, total_copies, shelf_location, description,
  } = body;

  if (!title?.trim()) throw new AppError('Title is required.', 400);

  if (bookId) {
    const { rows } = await query(
      `UPDATE library.library_books SET
         title = $1, title_am = $2, author = $3, isbn = $4, publisher = $5,
         published_year = $6, category = $7, subject_id = $8, grade_id = $9,
         language = $10, total_copies = $11, shelf_location = $12, description = $13,
         updated_at = now()
       WHERE id = $14 AND school_id = $15 AND deleted_at IS NULL
       RETURNING *`,
      [
        title.trim(), title_am || null, author || null, isbn || null, publisher || null,
        published_year || null, category || null, subject_id || null, grade_id || null,
        language || 'amharic', total_copies || 1, shelf_location || null, description || null,
        bookId, schoolId,
      ]
    );
    if (!rows[0]) throw new AppError('Book not found.', 404, ERROR_CODES.NOT_FOUND);
    return rows[0];
  }

  const copies = Math.max(1, Number(total_copies) || 1);
  const { rows } = await query(
    `INSERT INTO library.library_books (
       school_id, title, title_am, author, isbn, publisher, published_year,
       category, subject_id, grade_id, language, total_copies, available_copies,
       shelf_location, description
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)
     RETURNING *`,
    [
      schoolId, title.trim(), title_am || null, author || null, isbn || null,
      publisher || null, published_year || null, category || null,
      subject_id || null, grade_id || null, language || 'amharic',
      copies, shelf_location || null, description || null,
    ]
  );
  return rows[0];
};

export const borrowBook = async (schoolId, body, issuedBy) => {
  if (!(await librarySchemaReady())) notReady();

  const { book_id, borrower_id, borrower_type, due_date, fine_per_day_etb } = body;
  if (!book_id || !borrower_id || !borrower_type || !due_date) {
    throw new AppError('book_id, borrower_id, borrower_type, and due_date are required.', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const bookRes = await client.query(
      `SELECT * FROM library.library_books
       WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [book_id, schoolId]
    );
    const book = bookRes.rows[0];
    if (!book) throw new AppError('Book not found.', 404, ERROR_CODES.NOT_FOUND);
    if (book.available_copies < 1) {
      throw new AppError('No copies available.', 409, ERROR_CODES.CAPACITY_EXCEEDED);
    }

    const existing = await client.query(
      `SELECT id FROM library.book_borrowings
       WHERE book_id = $1 AND borrower_id = $2 AND status = 'borrowed'`,
      [book_id, borrower_id]
    );
    if (existing.rows[0]) {
      throw new AppError('Borrower already has this book.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }

    const borrowRes = await client.query(
      `INSERT INTO library.book_borrowings (
         school_id, book_id, borrower_id, borrower_type, issued_by, due_date, fine_per_day_etb
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [schoolId, book_id, borrower_id, borrower_type, issuedBy, due_date, fine_per_day_etb || 2]
    );

    await client.query(
      `UPDATE library.library_books SET available_copies = available_copies - 1, updated_at = now()
       WHERE id = $1`,
      [book_id]
    );

    await client.query('COMMIT');
    return borrowRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const returnBook = async (schoolId, borrowingId, returnedTo) => {
  if (!(await librarySchemaReady())) notReady();

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const borrowRes = await client.query(
      `UPDATE library.book_borrowings
       SET status = 'returned', return_date = CURRENT_DATE, returned_to = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 AND status = 'borrowed'
       RETURNING *`,
      [returnedTo, borrowingId, schoolId]
    );
    const borrowing = borrowRes.rows[0];
    if (!borrowing) throw new AppError('Active borrowing not found.', 404, ERROR_CODES.NOT_FOUND);

    await client.query(
      `UPDATE library.library_books
       SET available_copies = LEAST(total_copies, available_copies + 1), updated_at = now()
       WHERE id = $1`,
      [borrowing.book_id]
    );

    await client.query('COMMIT');
    return borrowing;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const listOverdue = async (schoolId) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `SELECT bb.*, lb.title AS book_title,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS borrower_name, u.email AS borrower_email,
            GREATEST(0, (CURRENT_DATE - bb.due_date))::int AS days_overdue,
            GREATEST(0, (CURRENT_DATE - bb.due_date)) * bb.fine_per_day_etb AS fine_amount_etb
     FROM library.book_borrowings bb
     JOIN library.library_books lb ON lb.id = bb.book_id
     JOIN identity.users u ON u.id = bb.borrower_id
     WHERE bb.school_id = $1 AND bb.status = 'borrowed' AND bb.due_date < CURRENT_DATE
     ORDER BY bb.due_date ASC`,
    [schoolId]
  );
  return rows;
};

export const listActiveBorrowings = async (schoolId) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `SELECT bb.*, lb.title AS book_title,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS borrower_name
     FROM library.book_borrowings bb
     JOIN library.library_books lb ON lb.id = bb.book_id
     JOIN identity.users u ON u.id = bb.borrower_id
     WHERE bb.school_id = $1 AND bb.status = 'borrowed'
     ORDER BY bb.due_date ASC`,
    [schoolId]
  );
  return rows;
};
