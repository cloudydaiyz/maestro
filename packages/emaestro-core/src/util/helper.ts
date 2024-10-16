// Helper functions

import { EventDataSource, MemberPropertyType, MemberPropertyValue } from "../types/core-types";
import { Replace } from "../types/util-types";
import { FORMS_REGEX, FORMS_URL_TEMPL, SHEETS_REGEX, SHEETS_URL_TEMPL } from "./constants";
import crypto from "crypto";

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

/** Returns true if the given member property value (from api call) is valid with the given member property type */
export function verifyApiMemberPropertyType(value: Replace<MemberPropertyValue, Date, string>, mpt: MemberPropertyType): boolean {
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

/** Maps an object to another object */
export function objectMap<T extends Object, U extends Object>(
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

/** Converts an object to an array */
export function objectToArray<T extends Object, U>(
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
export function arrayToObject<T, U extends Object>(
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
 * Extracts the JSON data from the encrypted string and returns it as a typed object.
 * The same string should return the same object.
 * @param key The key to use for decryption
 * @param iv The initialization vector (IV) used for encryption
 */
export function decrypt<T>(encrypted: string, key: string, iv: Buffer): T {
    let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return JSON.parse(decrypted) as T;
};

/**
 * Converts the data into a JSON string and encrypts it. The same object should return the same string.
 * @param key The key to use for encryption
 * @param iv The initialization vector (IV) to use for encryption
 */
export function encrypt<T>(data: T, key: string, iv: Buffer): string {
    const jsonifiedData = JSON.stringify(data);
    let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(jsonifiedData, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
};