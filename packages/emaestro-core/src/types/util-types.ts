import { MatchKeysAndValues, OnlyFieldsOfType, UpdateFilter } from "mongodb";
import { EventSchema } from "./core-types";

/**
 * This creates a version of T (provided type) with the given field (or fields if 
 * it's a union) being partial 
 * 
 * Application: K field can be deleted so another field can be added in its place
 */
export type WeakPartial<T extends Object, K extends keyof T> = Omit<T, K> & Partial<T>;

/**
 * Replaces all keys in type T without a value type in A with a value type of B. Affects
 * nested objects and arrays as well.
 */
export type Replace<T, A, B> = T extends A
    ? T
    : T extends Object
    ? T extends String | Date ? B : { [key in keyof T]: Replace<T[key], A, B> }
    : T extends Array<any>
    ? Array<Replace<T[number], A, B>>
    : B;

type t = null extends Object ? "a" : "b";

/** Replaces immutable properties in object with mutable properties */
export type Mutable<T extends Object> = { -readonly [P in keyof T]: T[P] }

/** Replaces optional parameters with null as well. This helps with API testing. */
export type NullOptional<T> = { [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] };

// == Troupe Types ==

export type Id = { id: string };

export type PreviousLastUpdated = { previousLastUpdated: string };

// == MongoDB Types ==

export type UpdateOperator<T, K extends string> = Mutable<Required<UpdateFilter<T>>[K]>;

export type SetOperator<T> = Mutable<Required<UpdateFilter<EventSchema>>["$set"]>;

export type UnsetOperator<T> = Mutable<Required<UpdateFilter<EventSchema>>["$unset"]>;