// ============================================================
//  VALIDATION MIDDLEWARE
//  ------------------------------------------------------------
//  Runs express-validator chains then returns a 400 with the first
//  error message (and the full list) if any validation failed.
//
//  Usage:
//    router.post('/x', validate([ body('title').notEmpty() ]), handler)
// ============================================================
const { validationResult } = require('express-validator');

function validate(validations) {
  return async (req, res, next) => {
    for (const v of validations) {
      // eslint-disable-next-line no-await-in-loop
      await v.run(req);
    }
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    const list = errors.array();
    return res.status(400).json({
      error: list[0].msg || 'Validation failed',
      errors: list.map((e) => ({ field: e.path || e.param, message: e.msg })),
    });
  };
}

module.exports = { validate };
