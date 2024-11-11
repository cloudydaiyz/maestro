// General helper functions

import type { ApiType } from "../types/api-types";
import type { EventDataSource, MemberPropertyType, MemberPropertyValue } from "../types/core-types";
import { DRIVE_FOLDER_REGEX, FORMS_REGEX, FORMS_URL_TEMPL, SHEETS_REGEX, SHEETS_URL_TEMPL } from "./constants";

/**
 * Replaces the `<id>` placeholder in the given URL with the provided ID based on the data source
 */
export function getDataSourceUrl(dataSource: EventDataSource, id: string): string {
    let url: string;
    if(dataSource == "Google Sheets") url = SHEETS_URL_TEMPL;
    else if(dataSource == "Google Forms") url = FORMS_URL_TEMPL;
    else return "";
    return url.replace(/<id>/, id);
}

/**
 * Retrieves the ID from the given URL based on the data source
 */
export function getDataSourceId(dataSource: EventDataSource, url: string): string | undefined {
    let regex: RegExp;
    if(dataSource == "Google Sheets") regex = SHEETS_REGEX;
    else if(dataSource == "Google Forms") regex = FORMS_REGEX;
    else if(dataSource == "Google Drive Folder") regex = DRIVE_FOLDER_REGEX;
    else return undefined;
    return regex.exec(url)?.groups?.["id"];
}

/** Returns true if the given member property value is valid with the given member property type */
export function verifyMemberPropertyType(value: MemberPropertyValue, mpt: MemberPropertyType): boolean  {
    if(mpt.endsWith("?") && value == null) return true;

    const rawType = mpt.slice(0, -1);
    const valueType = typeof value;
    if(rawType == "string") return valueType == "string";
    if(rawType == "number") return valueType == "number";
    if(rawType == "boolean") return valueType == "boolean";
    if(rawType == "date") return valueType == "object" && value instanceof Date;
    
    return false;
}

/** Returns the default value for the given member property type */
export function getDefaultMemberPropertyValue(mpt: MemberPropertyType): MemberPropertyValue {
    const rawType = mpt.slice(0, -1);
    if(rawType == "string") return "";
    if(rawType == "number") return 0;
    if(rawType == "boolean") return false;
    if(rawType == "date") return new Date();
    if(mpt.endsWith("!")) throw new Error("Cannot get default value for required member property");
    return null;
}

/** Returns true if the given member property value (from api call) is valid with the given member property type */
export function verifyApiMemberPropertyType(value: ApiType<MemberPropertyValue>, mpt: MemberPropertyType): boolean {
    const rawType = mpt.slice(0, -1);
    if(rawType == "date") {
        return typeof value == "string" && verifyMemberPropertyType(new Date(value), mpt);
    }
    return verifyMemberPropertyType(value, mpt);
}

/** Returns a random element from the given array */
export function randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/** Returns a shuffled version of an array */
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = array.slice();
    for(let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/** Removes the specified value from the given array, and returns the modified array */
export function deleteFromArray<T>(array: T[], value: T): T[] {
    const index = array.indexOf(value);
    if(index != -1) array.splice(index, 1);
    return array;
}

/** Maps an object to another object */
export function objectMap<T, U>(
    obj: T, 
    fn: (key: keyof T, value: T[keyof T]) => [key: keyof U, value: U[keyof U]]
): U {
    const newObj: U = {} as U;
    for(const key in obj) {
        const [newKey, newValue] = fn(key, obj[key]);
        newObj[newKey] = newValue;
    }
    return newObj;
}

export async function asyncObjectMap<T, U>(
    obj: T, 
    fn: (key: keyof T, value: T[keyof T]) => Promise<[key: keyof U, value: U[keyof U]]>
): Promise<U> {
    const newObj: U = {} as U;
    const ops = [];
    for(const key in obj) {
        ops.push(
            fn(key, obj[key]).then(res => {
                const [newKey, newValue] = res;
                newObj[newKey] = newValue;
            })
        );
    }
    await Promise.all(ops);
    return newObj;
}

/** Converts an object to an array */
export function objectToArray<T, U>(
    obj: T, 
    fn: (key: keyof T, value: T[keyof T]) => U
): U[] {
    const arr: U[] = [];
    for(const key in obj) {
        arr.push(fn(key, obj[key]));
    }
    return arr;
}

/** Converts an array to an object */
export function arrayToObject<T, U>(
    arr: T[], 
    fn: (value: T, index: number) => [key: keyof U, value: U[keyof U]]
): U {
    const obj: U = {} as U;
    for(let i = 0; i < arr.length; i++) {
        const [key, value] = fn(arr[i], i);
        obj[key] = value;
    }
    return obj;
}

/** 
 * Returns a pseudo version of MongoDB's ObjectID. 
 * Useful for decoupling from MongoDB dependencies. 
 */
export function generatePseudoObjectId(): string {
    return Math.floor(Date.now() / 1000).toString(16);
}

/** Assertion function defined outside of Node.js */
export function assert(value: unknown, message?: string | Error): asserts value {
    if(!value) {
        if(message instanceof Error) throw message;
        if(typeof message == 'string') throw new Error(message);
        throw new Error('Assertion failed.');
    }
};