import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validates a request segment against a Zod schema before the handler runs.
 * On failure responds 400 with the first issue message; on success replaces
 * the segment with the parsed (coerced/stripped) value.
 */
export function validate(schema: ZodSchema, segment: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[segment]);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      const where = issue?.path?.length ? ` (${issue.path.join('.')})` : '';
      return res.status(400).json({ success: false, error: `${issue?.message ?? 'Invalid request'}${where}` });
    }
    req[segment] = parsed.data;
    return next();
  };
}
