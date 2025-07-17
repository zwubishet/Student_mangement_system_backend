import express from 'express';
import ResourceRoute from '../controller/resourceController.js';


const ResourceRoutes = express.Router();
ResourceRoutes.get("/", ResourceRoute.Resources)
ResourceRoutes.get("/search", ResourceRoute.SearchResource)

export default ResourceRoutes;