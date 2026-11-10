import { ClassConstructor, plainToInstance, Transform } from 'class-transformer';

/**
 * multipart/form-data sends everything as strings ("true"/"false").
 * Reads the ORIGINAL value so implicit conversion can't turn "false" into true.
 */
export const ToBoolean = () =>
  Transform(({ obj, key }) => {
    const value = obj[key];
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    return value;
  });

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * For nested data sent through form-data as a JSON string, e.g.
 *   variants = '[{"size":50,"price":45000,"stock":10}]'
 * Parses the string and converts it into DTO instances so @ValidateNested works.
 * Also accepts real objects/arrays (when the request is plain JSON).
 */
export const ParseJson = <T>(cls?: ClassConstructor<T>) =>
  Transform(({ obj, key }) => {
    let value = obj[key];

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return value; // invalid JSON -> validation will reject it
      }
    }

    if (cls && value !== null && typeof value === 'object') {
      return plainToInstance(cls, value, { enableImplicitConversion: true });
    }

    return value;
  });