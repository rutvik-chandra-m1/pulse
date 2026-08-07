import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { projectRepository } from '../repositories/projectRepository.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(projectRepository.findByUser(req.user.id));
});

router.post('/', (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
    const project = projectRepository.create({ userId: req.user.id, name });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

export default router;
