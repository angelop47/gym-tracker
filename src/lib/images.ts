/** URLs of an exercise's photos, in order (start position first, if they were uploaded that way). */
export function exerciseImageUrls(exercise: { photoIds?: number[] }): string[] {
  return (exercise.photoIds ?? []).map((id) => `/photos/${id}`);
}
