import { MatchKeysAndValues, OnlyFieldsOfType } from "mongodb";

/**
 * This creates a version of T (provided type) with the given field (or fields if 
 * it's a union) being partial 
 * 
 * Application: K field can be deleted so another field can be added in its place
 */
export type WeakPartial<T, K extends keyof T> = Omit<T, K> & Partial<T>;

/**
 * Replaces all keys in type T with a value type of A with a value type of B. Affects
 * nested objects and arrays as well.
 */
export type Replace<T, A, B> = T extends A 
    ? B
    : T extends Object 
    ? { [key in keyof T]: Replace<T[key], A, B> }
    : T extends Array<any> 
    ? Array<Replace<T[number], A, B>>
    : T;

export type Mutable<T> = { -readonly [P in keyof T]: T[P] }

// == Troupe Types ==

export type Id = { id: string };

export type PreviousLastUpdated = { previousLastUpdated: string };

// == MongoDB Types ==

export type SetOperator<T> = Mutable<MatchKeysAndValues<T>>;

export type UnsetOperator<T> = Mutable<OnlyFieldsOfType<T, any, '' | true | 1>>;