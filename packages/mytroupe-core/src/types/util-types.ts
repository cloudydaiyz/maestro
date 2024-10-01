
/**
 * This creates a version of T (provided type) with the given field (or fields if 
 * it's a union) being partial 
 * 
 * Application: K field can be deleted so another field can be added in its place
 */
export type WeakPartial<T, K extends keyof T> = Omit<T, K> & Partial<T>;

// WeakPartial<_, A, B> & Replace<_, Date, string> & Replace<_, ObjectId, string>
// 
type Replace<A, B> = string;