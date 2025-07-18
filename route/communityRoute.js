import express from 'express';
import communityRoute from '../controller/communityController.js'
import AuthenticationMiddleware from '../middleware/AuthenticationMiddleware.js';

const CommunityRoutes = express.Router();

// Clear prefixes for clarity
CommunityRoutes.post('/post', AuthenticationMiddleware, communityRoute.CommunityPost);
CommunityRoutes.get('/getPost/:type', communityRoute.FilterCommunityPost);
CommunityRoutes.get('/getPost', communityRoute.GetCommunityPost);
CommunityRoutes.get('/mine', AuthenticationMiddleware, communityRoute.MyPost);
CommunityRoutes.put('/update/:postId', AuthenticationMiddleware, communityRoute.UpdatePost);
CommunityRoutes.delete('/delete/:postId', AuthenticationMiddleware, communityRoute.DeletePost);
CommunityRoutes.post('/comment', AuthenticationMiddleware, communityRoute.CommentPost);
CommunityRoutes.get('/comment/:postId', communityRoute.GetComment);
CommunityRoutes.delete('/comment/:postId', communityRoute.DeleteComment);
export default CommunityRoutes;
