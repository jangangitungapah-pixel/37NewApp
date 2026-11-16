import { zodResolver } from '@hookform/resolvers/zod';

/**
 * Builds consistent React Hook Form options wired to Zod schema validation.
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {Partial<T>} [defaultValues]
 * @param {object} [extraOptions]
 */
export function createZodFormConfig(schema, defaultValues = {}, extraOptions = {}) {
  return {
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    ...extraOptions,
  };
}

/**
 * Safely reads nested field error text from React Hook Form's error object.
 * @param {Record<string, unknown>} errors
 * @param {string} name
 * @returns {string | undefined}
 */
export function extractFieldErrorMessage(errors, name) {
  if (!errors || !name) {
    return undefined;
  }
  const parts = String(name).split('.');
  let cursor = errors;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = cursor[part];
  }
  if (cursor && typeof cursor === 'object' && typeof cursor.message === 'string') {
    return cursor.message;
  }
  return undefined;
}
