import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as library from '../../services/library/physicalLibraryService.js';

export const listBooks = catchAsync(async (req, res) => {
  const result = await library.listBooks(req.tenant.schoolId, req.query);
  sendPaginated(res, result.items, result.total, result.page, result.limit);
});

export const createBook = catchAsync(async (req, res) => {
  sendSuccess(res, await library.upsertBook(req.tenant.schoolId, req.body), 201);
});

export const updateBook = catchAsync(async (req, res) => {
  sendSuccess(res, await library.upsertBook(req.tenant.schoolId, req.body, req.params.id));
});

export const borrow = catchAsync(async (req, res) => {
  sendSuccess(res, await library.borrowBook(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const returnBorrowing = catchAsync(async (req, res) => {
  sendSuccess(res, await library.returnBook(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const overdue = catchAsync(async (req, res) => {
  sendSuccess(res, await library.listOverdue(req.tenant.schoolId));
});

export const activeBorrowings = catchAsync(async (req, res) => {
  sendSuccess(res, await library.listActiveBorrowings(req.tenant.schoolId));
});
