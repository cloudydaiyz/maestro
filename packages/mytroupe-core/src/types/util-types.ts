
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

const animals = ['cat', 'dog', 'mouse'] as const
type Animal = typeof animals[number]

interface ReplaceExample {
    a: Date,
    b: string,
    c: number,
    d: {
        e: Date,
        f: string,
    };
    g: {
        h: Date,
        i: number,
    }[];
}

type ReplacedExample = Replace<ReplaceExample, Date, string>;
const obj: ReplacedExample = {
    a: 'date',
    b: 'string',
    c: 1,
    d: {
        e: 'date',
        f: 'string',
    },
    g: [
        {
            h: 'date',
            i: 1,
        },
    ],
}