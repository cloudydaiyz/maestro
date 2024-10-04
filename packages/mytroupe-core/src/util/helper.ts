// Helper functions

/**
 * Replaces the `<id>` placeholder in the given URL with the provided ID
 */
export function getUrl(url: string, id: string): string {
    return url.replace(/<id>/, id);
}