// Cryptography methods
import crypto from "crypto";

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