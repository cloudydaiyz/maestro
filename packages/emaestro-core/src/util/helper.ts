// Helper functions

import { EventDataSource, MemberPropertyType, MemberPropertyValue } from "../types/core-types";
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
export function getDataSourceId(dataSource: EventDataSource, url: string): string {
    let regex: RegExp;
    if(dataSource == "Google Sheets") regex = SHEETS_REGEX;
    else if(dataSource == "Google Forms") regex = FORMS_REGEX;
    else return "";
    return regex.exec(url)!.groups!["id"];
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

export function verifyMemberPropertyType(value: MemberPropertyValue, type: MemberPropertyType) {
    if(type.endsWith("?") && value == null) return true;

    const rawType = type.replace("?", "").replace("!", "");
    const valueType = typeof value;
    if(rawType == "string") return valueType == "string";
    if(rawType == "number") return valueType == "number";
    if(rawType == "boolean") return valueType == "boolean";
    if(rawType == "date") return valueType == "string" && !isNaN((new Date(value as string)).getTime());
    
    return false;
}

/** Returns a random element from the given array */
export function randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}