import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate } from '../middlewares/validate.js';
import {
  createAcademicYearSchema,
  updateAcademicYearSchema,
  createTermSchema,
  updateTermSchema,
  createGradeLevelSchema,
  updateGradeLevelSchema,
  createSectionSchema,
  updateSectionSchema,
  createSubjectSchema,
  updateSubjectSchema,
  classSubjectSchema,
  bulkClassSubjectsSchema,
  timetableSlotSchema,
} from '../utils/schemas.js';
import * as ctrl from '../controllers/catalog/catalogController.js';

const router = express.Router();
const admin = requireRole('SCHOOL_ADMIN');

router.use(requireTenant, requireRole('SCHOOL_ADMIN', 'TEACHER'));

router.get('/overview', ctrl.getOverview);

router.get('/years/current', ctrl.getCurrentYear);
router.get('/years', ctrl.getYears);
router.post('/years', admin, validate(createAcademicYearSchema), ctrl.createYear);
router.patch('/years/:id', admin, validate(updateAcademicYearSchema), ctrl.updateYear);
router.post('/years/:id/set-current', admin, ctrl.setCurrentYear);
router.delete('/years/:id', admin, ctrl.deleteYear);

router.get('/terms', ctrl.getTerms);
router.get('/terms/:id', ctrl.getTerm);
router.post('/terms', admin, validate(createTermSchema), ctrl.createTerm);
router.patch('/terms/:id', admin, validate(updateTermSchema), ctrl.updateTerm);
router.post('/terms/:id/set-current', admin, ctrl.setCurrentTerm);
router.delete('/terms/:id', admin, ctrl.deleteTerm);

router.get('/grades', ctrl.getGrades);
router.post('/grades', admin, validate(createGradeLevelSchema), ctrl.createGrade);
router.patch('/grades/:id', admin, validate(updateGradeLevelSchema), ctrl.updateGrade);
router.delete('/grades/:id', admin, ctrl.deleteGrade);

router.get('/sections', ctrl.getSections);
router.get('/sections/:id', ctrl.getSectionById);
router.post('/sections', admin, validate(createSectionSchema), ctrl.createSection);
router.patch('/sections/:id', admin, validate(updateSectionSchema), ctrl.updateSection);
router.delete('/sections/:id', admin, ctrl.deleteSection);

router.get('/subjects', ctrl.getSubjects);
router.post('/subjects', admin, validate(createSubjectSchema), ctrl.createSubject);
router.patch('/subjects/:id', admin, validate(updateSubjectSchema), ctrl.updateSubject);
router.delete('/subjects/:id', admin, ctrl.deleteSubject);

router.get('/classes', ctrl.getClasses);
router.get('/classes/:classId/subjects', ctrl.getClassSubjects);
router.post('/class-subjects', admin, validate(classSubjectSchema), ctrl.addClassSubject);
router.post('/class-subjects/bulk', admin, validate(bulkClassSubjectsSchema), ctrl.bulkClassSubjects);
router.patch('/class-subjects/:linkId', admin, ctrl.updateClassSubject);
router.delete('/class-subjects/:linkId', admin, ctrl.removeClassSubject);

router.get('/timetable', ctrl.getTimetable);
router.post('/timetable', admin, validate(timetableSlotSchema), ctrl.createTimetableSlot);
router.delete('/timetable/:id', admin, ctrl.deleteTimetableSlot);

export default router;
