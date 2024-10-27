// Helper functions

import dayjs, { Dayjs } from "dayjs";
import { ApiType } from "../types/api-types";
import { EventDataSource, MemberPropertyType, MemberPropertyValue } from "../types/core-types";
import { DRIVE_FOLDER_REGEX, FORMS_REGEX, FORMS_URL_TEMPL, SHEETS_REGEX, SHEETS_URL_TEMPL } from "./constants";
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
 * Extracts the JSON data from the encrypted string and returns it as a typed object.
 * The same string should return the same object.
 * @param key The key to use for decryption
 * @param iv The initialization vector (IV) used for encryption
 */
export function decrypt<T>(encrypted: string, key: string, iv: Buffer | string): T {
    if(typeof iv == "string") iv = Buffer.from(iv, "base64");

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
export function encrypt<T>(data: T, key: string, iv: Buffer | string): string {
    const jsonifiedData = JSON.stringify(data);
    if(typeof iv == "string") iv = Buffer.from(iv, "base64");

    let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(jsonifiedData, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
};

/** Generates a random string with the given length */
export function randomString(length?: number): string {
    if(!length) length = 16; // for creating initialization vectors
    return crypto.randomBytes(length).toString("base64");
}

/** Standardized date parsing */
export class DateParser {
    private date: Dayjs;
    /** Supported date formats */
    public static formats = [
        "M/D/YYYY",
        "M/D/YYYY H:mm:ss",
        "MM-DD",
        "YYYY-MM-DD",
        "MM-DD HH:MM",
        "YYYY-MM-DD HH:MM"
    ] as const;

    constructor(date: Date | Dayjs) {
        this.date = dayjs(date);
    }

    /** 
     * Parses the input string into a DateParser object using one of the supported formats (see {@link DateParser.formats}). 
     * Returns null if the input doesn't match any of the formats.
     */
    static parse(input: string): DateParser | null {
        for(const format of DateParser.formats) {
            const d = dayjs(input, format, true);
            if(d.isValid()) return new DateParser(d);
        }
        return null;
    }

    /** Stringified date as `MM-DD-YYYY` format */
    toString(): string {
        return dayjs(this.date).format("MM-DD-YYYY");
    }

    static toString(date: Date | Dayjs): string {
        return (new DateParser(date)).toString();
    }

    toDate(): Date {
        return this.date.toDate();
    }

    toDayJs(): Dayjs {
        return this.date;
    }
}