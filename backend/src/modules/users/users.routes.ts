import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './users.controller.js'
import { createStaffSchema, listUsersQuerySchema, updateUserSchema, userIdParamSchema } from './users.schemas.js'

export const usersRouter = Router()

usersRouter.use(authenticate, requireRole('admin'))

usersRouter.get('/', validate({ query: listUsersQuerySchema }), controller.listUsers)
usersRouter.post('/staff', validate({ body: createStaffSchema }), controller.createStaff)
usersRouter.get('/:id', validate({ params: userIdParamSchema }), controller.getUser)
usersRouter.patch('/:id', validate({ params: userIdParamSchema, body: updateUserSchema }), controller.updateUser)
