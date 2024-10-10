// Troupe log sheet in Google Sheets

import { WithId } from "mongodb";
import { TroupeSchema, EventSchema, MemberSchema, EventsAttendedBucketSchema, AttendeeSchema } from "../../types/core-types";
import { TroupeLogService } from "../base-service";
import { drive_v3, sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "../../cloud/gcp";
import { BASE_MEMBER_PROPERTY_TYPES, SHEETS_REGEX } from "../../util/constants";
import { PARENT_DRIVE_FOLDER_ID } from "../../util/env";
import assert from "assert";
import { getDataSourceId } from "../../util/helper";

namespace Colors {
    function rgb(hex: string): sheets_v4.Schema$Color {
        const red: number = Number.parseInt(hex.slice(0, 2), 16) / 255;
        const green: number = Number.parseInt(hex.slice(2, 4), 16) / 255; 
        const blue: number = Number.parseInt(hex.slice(4, 6), 16) / 255;
        return { red, green, blue };
    }

    export const yellow = rgb("FFD966");
    export const lightYellow = rgb("FFE599");
    export const green = rgb("B9D7A8");
    export const lightGreen = rgb("D9EAD3");
    export const orange = rgb("F6B26B");
    export const lightOrange = rgb("F9CB9C");
    export const black = rgb("000000");
    export const gray = rgb("999999");
}

export class GoogleSheetsLogService extends TroupeLogService {
    constructor() { super() }

    protected headerBuilder(data: string[], color: sheets_v4.Schema$Color, subheader?: boolean, event?: true): sheets_v4.Schema$CellData[] {
        return data.map((value, i) => {
            const userEnteredValue: sheets_v4.Schema$ExtendedValue = { stringValue: value };
            const userEnteredFormat: sheets_v4.Schema$CellFormat = { 
                backgroundColor: color,
                textFormat: { bold: true },
            };
            if(subheader) userEnteredFormat.borders = { bottom: { style: "SOLID", color: Colors.black } };
            if(event) {
                userEnteredFormat.horizontalAlignment = "CENTER";
                if(!subheader) {
                    userEnteredFormat.wrapStrategy = "CLIP";
                    userEnteredFormat.textRotation = { angle: -90 };
                    userEnteredFormat.verticalAlignment = "TOP";
                }
            }
            return { userEnteredValue, userEnteredFormat };
        });
    }

    protected cellBuilder(data: string[]): sheets_v4.Schema$CellData[] {
        return data.map(value => ({ 
            userEnteredValue: { stringValue: value },
            userEnteredFormat: { wrapStrategy: "CLIP" }, 
        }));
    }

    /**
     * If provided, all events and attendee schema must be from the provided troupe.
     * Ensure the events are sorted by ascending start date, and audience by ascending total membership points. e.g.:
     * - `events?.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());`
     * - `audience?.sort((a, b) => a.points["Total"] - b.points["Total"]);`
     */
    async createLog(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[] = [], audience: WithId<AttendeeSchema>[] = []): Promise<string> {
        const drive = await getDrive();
        const sheets = await getSheets();

        // Prepare for sheet update after sheet creation (deletes unused columns from created sheets)
        const requests: sheets_v4.Schema$Request[] = [];

        // Build the Event Type Log
        const eventTypeLogSheet = this.buildEventTypeLog(troupe);
        requests.push({
            deleteDimension: {
                range: {
                    sheetId: 0,
                    dimension: "COLUMNS",
                    startIndex: 5,
                    endIndex: 26,
                }
            }
        });

        // Build the Event Log
        const eventLogSheet = this.buildEventLog(events);
        requests.push({
            deleteDimension: {
                range: {
                    sheetId: 1,
                    dimension: "COLUMNS",
                    startIndex: 10,
                    endIndex: 26,
                }
            }
        });

        // Build the Audience Log
        const audienceLogSheet = this.buildAudienceLog(troupe, events, audience, requests);

        // Create the spreadsheet
        const createSheet = await sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: "My Troupe Log " + Date.now()
                },
                sheets: [ eventTypeLogSheet, eventLogSheet, audienceLogSheet ],
            }
        });
        assert(createSheet.data.spreadsheetId && createSheet.data.spreadsheetUrl, "Failed to create log sheet");
        console.log(createSheet.data.spreadsheetId);

        const postCreationOps: Promise<any>[] = [];
        
        // Update the spreadsheet, deleting unnecessary rows
        postCreationOps.push(sheets.spreadsheets.batchUpdate({
            spreadsheetId: createSheet.data.spreadsheetId!,
            requestBody: { requests }
        }));

        // Move the spreadsheet to the main drive folder for all troupes
        postCreationOps.push(drive.files.update({
            fileId: createSheet.data.spreadsheetId!,
            addParents: PARENT_DRIVE_FOLDER_ID,
        }));

        await Promise.all(postCreationOps);
        return createSheet.data.spreadsheetUrl;
    }

    protected buildEventTypeLog(troupe: WithId<TroupeSchema>): sheets_v4.Schema$Sheet {
        const eventTypeLogHeaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder(["EVENT TYPES"], Colors.orange),
            ]
        };

        const eventTypeLogSubheaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder(["Type No.", "Type ID", "Title", "Value", ""], Colors.lightOrange, true),
            ]
        }

        const eventTypeLogData: sheets_v4.Schema$RowData[] = troupe.eventTypes.map((eventType, i) => {
            return {
                values: [
                    ...this.cellBuilder([i.toString(), eventType._id.toHexString(), eventType.title, eventType.value.toString(), ""]),
                ]
            };
        });

        const eventTypeLogSheet: sheets_v4.Schema$Sheet = {
            properties: {
                sheetId: 0,
                title: "Event Type Log",
                tabColorStyle: { rgbColor: Colors.orange },
            },
            data: [
                {
                    rowData: [eventTypeLogHeaders, eventTypeLogSubheaders, ...eventTypeLogData],
                    columnMetadata: [
                        ...[110, 200, 200, 130, 23]
                            .map(pixelSize => ({ pixelSize })),
                    ]
                }
            ],
            merges: [
                {
                    sheetId: 0,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 5
                }
            ]
        }

        return eventTypeLogSheet;
    }

    protected buildEventLog(events: WithId<EventSchema>[]): sheets_v4.Schema$Sheet {
        const eventLogHeaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder(["EVENTS"], Colors.yellow),
            ]
        };

        const eventLogSubheaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder([
                    "Event No.", "Event ID", "Event Type No.", "Event Type Title", 
                    "Title", "Start Date", "Value", "Source", "Source URI", ""
                ], Colors.lightYellow, true),
            ]
        };

        const eventLogData: sheets_v4.Schema$RowData[] = events.map((event, i) => {
            return {
                values: [
                    ...this.cellBuilder([
                        i.toString(), event._id.toHexString(), event.eventTypeId || "", event.eventTypeTitle || "", 
                        event.title, event.startDate.toISOString(), event.value.toString(), event.source, event.sourceUri, ""
                    ]),
                ]
            };
        });

        const eventLogSheet: sheets_v4.Schema$Sheet = {
            properties: {
                sheetId: 1,
                title: "Event Log",
                tabColorStyle: { rgbColor: Colors.yellow },
            },
            data: [
                {
                    rowData: [eventLogHeaders, eventLogSubheaders, ...eventLogData],
                    columnMetadata: [
                        ...[110, 200, 110, 200, 400, 110, 110, 110, 200, 23]
                            .map(pixelSize => ({ pixelSize })),
                    ]
                }
            ],
            merges: [
                {
                    sheetId: 1,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 10
                },
            ]
        };

        return eventLogSheet;
    }

    protected buildAudienceLog(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<AttendeeSchema>[], updateRequests: sheets_v4.Schema$Request[]): sheets_v4.Schema$Sheet {
        const eventTitles = events.map(e => e.title);

        /** Object array of keys for each property type in the troupe; first section of subheader values */
        let memberInformationSection = Object.keys(troupe.memberPropertyTypes);
        memberInformationSection.sort((a, b) => {
            const baseMemberProperties = Object.keys(BASE_MEMBER_PROPERTY_TYPES);
            const aBaseKey = baseMemberProperties.indexOf(a);
            const bBaseKey = baseMemberProperties.indexOf(b);
            return aBaseKey == bBaseKey && aBaseKey == -1 ? a.localeCompare(b) : aBaseKey - bBaseKey;
        });
        memberInformationSection = memberInformationSection.splice(1, 0, "Member No.");

        /** Second section of subheader values */
        const membershipPointsSection = Object.keys(troupe.pointTypes);
        /** Third section of subheader values */
        const eventNumbersSection = events.map((e, i) => String(i));

        const audienceLogHeaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder(["MEMBER INFORMATION"], Colors.green),
                ...Array(memberInformationSection.length).fill({}),
                ...this.headerBuilder(["MEMBERSHIP POINTS"], Colors.green),
                ...Array(membershipPointsSection.length).fill({}),
                ...this.headerBuilder(eventTitles.concat(""), Colors.green, false, true),
            ]
        };

        /** Tracks the max characters in each column for resizing */
        const audienceLogMaxCharacters = Array(audienceLogHeaders.values!.length).fill(0);

        const audienceLogSubheaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder([
                    ...memberInformationSection, "",
                    ...membershipPointsSection, "",
                ], Colors.lightGreen, true),
                ...this.headerBuilder(eventNumbersSection.concat(""), Colors.lightGreen, true, true),
            ]
        };

        audienceLogSubheaders.values!.forEach((cell, i) => {
            if(cell.effectiveValue!.stringValue!.length > audienceLogMaxCharacters[i]) {
                audienceLogMaxCharacters[i] = cell.effectiveValue!.stringValue!.length;
            }
        });

        const audienceLogData: sheets_v4.Schema$RowData[] = audience.map((member, i) => {

            const memberProperties = memberInformationSection.map((prop, i) => {
                const data = prop == "Member No." 
                    ? i.toString()
                    : member.properties[prop].value?.toString() || "";
                if(data.length > audienceLogMaxCharacters[i]) audienceLogMaxCharacters[i] = data.length;
                return data;
            });

            const memberPoints = membershipPointsSection.map((point, i) => {
                const data = member.points[point].toString();
                if(data.length > audienceLogMaxCharacters[i + memberInformationSection.length + 1]) {
                    audienceLogMaxCharacters[i + memberInformationSection.length + 1] = data.length;
                }
                return data;
            });

            const eventsAttended = events 
                ? events.map(event =>  member.eventsAttended[event._id.toHexString()] ? "X" : "")
                : [""];

            return {
                values: [ ...this.cellBuilder([...memberProperties, "", ...memberPoints, "", ...eventsAttended]) ]
            };
        });
        
        // Resize each column of the Audience Log based on the max characters in each cell
        const columnMetadata: sheets_v4.Schema$DimensionProperties[] = audienceLogMaxCharacters.map((maxCharacters, i) => { 
            let pixelSize = 23;
            if(maxCharacters > 20) pixelSize = 200;
            else if(maxCharacters > 10) pixelSize = 110;
            else if(maxCharacters > 13) pixelSize = 160;
            else if(maxCharacters > 4) pixelSize = 85;
            else if(maxCharacters > 3) pixelSize = 37;
            else if(maxCharacters > 2) pixelSize = 29;
            return { pixelSize };
        });
        
        const audienceLogSheet: sheets_v4.Schema$Sheet = {
            properties: {
                sheetId: 2,
                title: "Member Log",
                tabColorStyle: {
                    rgbColor: Colors.green
                }
            },
            data: [
                {
                    rowData: [audienceLogHeaders, audienceLogSubheaders, ...audienceLogData],
                    columnMetadata,
                    rowMetadata: [ { pixelSize: 110 } ]
                }
            ],
            merges: [
                {
                    sheetId: 2,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: memberInformationSection.length + 1,
                },
                {
                    sheetId: 2,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: memberInformationSection.length + 1,
                    endColumnIndex: memberInformationSection.length + membershipPointsSection.length + 2,
                }
            ]
        };

        // Resize the columns if the headers are less than 26
        if(audienceLogHeaders.values!.length < 26) {
            updateRequests.push({
                deleteDimension: {
                    range: {
                        sheetId: 2,
                        dimension: "COLUMNS",
                        startIndex: audienceLogHeaders.values!.length,
                        endIndex: 26,
                    }
                }
            });
        }

        return audienceLogSheet;
    }

    async deleteLog(troupe: WithId<TroupeSchema>): Promise<void> {
        const drive = await getDrive();
        const fileId = SHEETS_REGEX.exec(troupe.logSheetUri)?.groups?.["spreadsheetId"];
        if(fileId) await drive.files.delete({ fileId });
    }

    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#Request
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#UpdateSpreadsheetPropertiesRequest

    protected async updateLog(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<AttendeeSchema>[]): Promise<void> {
        const sheets = await getSheets();
        const spreadsheetId = getDataSourceId("Google Sheets", troupe.logSheetUri);

        const updateRequests: sheets_v4.Schema$Request[] = [];
        const currentData = await sheets.spreadsheets.values.batchGet({ 
            spreadsheetId, 
            ranges: ["Event Type Log!A3:D", "Event Log!A3:I", "Member Log!A1:2"],
        });

        updateRequests.concat(this.updateEventTypeLog(currentData.data.valueRanges?.[0].values || [], troupe));

        if(updateRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: updateRequests } });
        }
    }

    protected updateEventTypeLog(currentData: string[][], troupe: WithId<TroupeSchema>): sheets_v4.Schema$Request[] {
        const requests: sheets_v4.Schema$Request[] = [];

        const desiredData: sheets_v4.Schema$RowData[] = troupe.eventTypes.map((eventType, i) => {
            return {
                values: [
                    ...this.cellBuilder([i.toString(), eventType._id.toHexString(), eventType.title, eventType.value.toString(), ""]),
                ]
            };
        });

        // If there are currently more columns than desired, delete the extra columns
        if(currentData.length > desiredData.length) {
            requests.push({
                deleteDimension: {
                    range: {
                        sheetId: 0,
                        dimension: "ROWS",
                        startIndex: desiredData.length,
                        endIndex: currentData.length,
                    }
                }
            });
        }

        // Update the rows that have changed
        const updatedRows: sheets_v4.Schema$RowData[] = [];
        for(let i = 0; i <= desiredData.length; i++) {
            let addRow = false;
            const row = desiredData[i];

            // Check the row to see if any cells have changed and, if so, add the row to the updated rows
            for(let j = 0; !addRow && j <= row.values!.length; j++) {
                const desiredCell = row.values![j].effectiveValue!.stringValue;
                if(desiredCell != currentData[i][j]) {
                    updatedRows.push(row);
                    addRow = true;
                }
            }

            // If the row has not changed, add an empty row to the updated rows.
            // For the Google Sheets API, you can skip rows, but you can't skip cells.
            if(!addRow) {
                updatedRows.push({});
            }
        }

        // If there's any updated rows, update the cells
        if(updatedRows.length > 0) {
            requests.push({
                updateCells: {
                    rows: updatedRows,
                    fields: "userEnteredValue",
                    start: { sheetId: 0, rowIndex: 2, columnIndex: 0 },
                }
            });
        }

        return requests;
    }
}