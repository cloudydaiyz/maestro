import { MatchKeysAndValues, OnlyFieldsOfType, UpdateFilter } from "mongodb";
import { EventSchema } from "./core-types";

/**
 * This creates a version of T (provided type) with the given field (or fields if 
 * it's a union) being partial 
 * 
 * Application: K field can be deleted so another field can be added in its place
 */
export type WeakPartial<T, K extends keyof T> = Omit<T, K> & Partial<T>;

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

export type Mutable<T> = { -readonly [P in keyof T]: T[P] }

// == Troupe Types ==

export type Id = { id: string };

export type PreviousLastUpdated = { previousLastUpdated: string };

// == MongoDB Types ==

export type UpdateOperator<T, K extends string> = Mutable<Required<UpdateFilter<T>>[K]>;

export type SetOperator<T> = Mutable<Required<UpdateFilter<EventSchema>>["$set"]>;

export type UnsetOperator<T> = Mutable<Required<UpdateFilter<EventSchema>>["$unset"]>;