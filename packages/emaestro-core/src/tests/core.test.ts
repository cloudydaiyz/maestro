import init from "./init";
import { beforeAll, test, describe } from "@jest/globals";

beforeAll(init);

describe("core", () => {
    test("hw", () => {
        console.log("Test:", process.env.MONGODB_URI);
        console.log("hello world");
        let j = 0;
        for(let i = 0; i < 20; i++) {
            j += i;
        }
        console.log("hello " + j);
    });
});