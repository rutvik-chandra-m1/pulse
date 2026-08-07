import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Request failed validation',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: err.code || 'internal_error',
    message: status >= 500 ? 'Something went wrong' : err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}
