import slugify from 'slugify';
import { Model } from 'mongoose';

export const toSlug = (text: string): string =>
  slugify(text, { lower: true, strict: true, trim: true });

/**
 * Creates a slug that doesn't exist yet in the collection.
 * "Dior Sauvage" -> "dior-sauvage" -> "dior-sauvage-2" if taken.
 */
export async function generateUniqueSlug(
  model: Model<any>,
  text: string,
  excludeId?: string,
): Promise<string> {
  const base = toSlug(text) || 'item';
  let slug = base;
  let counter = 2;

  while (
    await model.exists({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${base}-${counter++}`;
  }

  return slug;
}