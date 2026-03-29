import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';

export const handleCreateAnnouncementAction = catchAsync(async (req, res, next) => {
  const { title, content, target_role, priority } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];
  const user_id = req.body.session_variables['x-hasura-user-id'];

  const client = await getClient();

  const result = await client.query(
    `INSERT INTO operations.announcements 
     (school_id, author_id, title, content, target_role, priority) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING id`,
    [school_id, user_id, title, content, target_role || 'ALL', priority || 'normal']
  );

  res.json({
    id: result.rows[0].id,
    status: "published"
  });
});