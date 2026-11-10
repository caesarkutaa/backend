/** Remove keys whose value is undefined (so PATCH doesn't wipe fields) */
export const compact = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/** Strict 24-hex check (mongoose's isValidObjectId accepts any 12-char string, e.g. slugs) */
export const isObjectId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);

export const escapeRegex = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');