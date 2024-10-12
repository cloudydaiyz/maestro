"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_SHEET_DRIVE_ID = exports.BASE_LOG_SHEET_ID = exports.SERVICE_KEY_PATH = exports.MONGODB_PASS = exports.MONGODB_USER = exports.MONGODB_URI = void 0;
const assert_1 = __importDefault(require("assert"));
exports.MONGODB_URI = process.env.MONGODB_URI;
exports.MONGODB_USER = process.env.MONGODB_USER;
exports.MONGODB_PASS = process.env.MONGODB_PASS;
exports.SERVICE_KEY_PATH = process.env.SERVICE_KEY_PATH;
exports.BASE_LOG_SHEET_ID = process.env.BASE_LOG_SHEET_ID;
exports.LOG_SHEET_DRIVE_ID = process.env.LOG_SHEET_DRIVE_ID;
const requiredEnvVars = [
    exports.MONGODB_URI,
    exports.MONGODB_USER,
    exports.MONGODB_PASS,
];
(0, assert_1.default)(requiredEnvVars.every((envVar) => envVar), "Missing required environment variables");
//# sourceMappingURL=env.js.map