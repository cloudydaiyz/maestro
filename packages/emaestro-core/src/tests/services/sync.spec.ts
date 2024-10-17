import init from "../util/init";
import { defaultConfig, noMembersConfig } from "../util/db-config";

import { describe } from "@jest/globals";
import { objectToArray } from "../../util/helper";
import { GoogleSheetsLogService } from "../../services/logs/gsheets-log";
import { WithId } from "mongodb";
import { AttendeeSchema, EventSchema } from "../../types/core-types";

const { addResource, dbSetup } = init();

describe("troupe sync service", () => {
    const service = new GoogleSheetsLogService();
    let currentLog: string | null;

});