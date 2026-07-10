export class AtlasError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AtlasError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new AtlasError('VALIDATION_ERROR', `${name} is required`, 400, { field: name });
  }
  return value;
}
