// Troupe log sheet in Google Sheets

import { WithId } from "mongodb";
import { TroupeSchema, EventSchema, MemberSchema, EventsAttendedBucketSchema, AttendeeSchema } from "../../types/core-types";
import { TroupeLogService } from "../base-service";
import { sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "../../cloud/gcp";
import assert from "assert";
import { BASE_MEMBER_PROPERTY_TYPES, SHEETS_REGEX } from "../../util/constants";
import { PARENT_DRIVE_FOLDER_ID } from "../../util/env";

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

    // If provided, all events, audience, and events attended schema must be from the provided troupe.
    async createLog(troupe: WithId<TroupeSchema>, events?: WithId<EventSchema>[], audience?: WithId<AttendeeSchema>[]): Promise<string> {
        const drive = await getDrive();
        const sheets = await getSheets();

        // Ensure the events are sorted by the start date, and audience by total membership points
        // events?.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        // audience?.sort((a, b) => a.points["Total"] - b.points["Total"]);

        // Build the Event Type Log
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

        // Build the Event Log
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

        const eventLogData: sheets_v4.Schema$RowData[] = events 
            ? events?.map((event, i) => {
                return {
                    values: [
                        ...this.cellBuilder([
                            i.toString(), event._id.toHexString(), event.eventTypeId || "", event.eventTypeTitle || "", 
                            event.title, event.startDate.toISOString(), event.value.toString(), event.source, event.sourceUri, ""
                        ]),
                    ]
                };
            })
            : [];

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

        // Build the Audience Log
        const eventTitles = events ? events.map(e => e.title) : [];

        let memberInformation = Object.keys(troupe.memberPropertyTypes);
        memberInformation.sort((a, b) => {
            const baseMemberProperties = Object.keys(BASE_MEMBER_PROPERTY_TYPES);
            const aBaseKey = baseMemberProperties.indexOf(a);
            const bBaseKey = baseMemberProperties.indexOf(b);
            return aBaseKey == bBaseKey && aBaseKey == -1 ? a.localeCompare(b) : aBaseKey - bBaseKey;
        });
        memberInformation = memberInformation.splice(1, 0, "Member No.");

        const membershipPoints = Object.keys(troupe.pointTypes);
        const eventNos = events ? events.map((e, i) => String(i)) : [];

        const audienceLogHeaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder(["MEMBER INFORMATION"], Colors.green),
                ...Array(memberInformation.length).fill({}),
                ...this.headerBuilder(["MEMBERSHIP POINTS"], Colors.green),
                ...Array(membershipPoints.length).fill({}),
                ...this.headerBuilder(eventTitles.concat(""), Colors.green, false, true),
            ]
        };

        const audienceLogMaxCharacters = Array(audienceLogHeaders.values!.length).fill(0);

        const audienceLogSubheaders: sheets_v4.Schema$RowData = {
            values: [
                ...this.headerBuilder([
                    ...memberInformation, "",
                    ...membershipPoints, ""
                ], Colors.lightGreen, true),
                ...this.headerBuilder(eventNos.concat(""), Colors.lightGreen, true, true),
            ]
        };

        audienceLogSubheaders.values!.forEach((cell, i) => {
            if(cell.effectiveValue!.stringValue!.length > audienceLogMaxCharacters[i]) {
                audienceLogMaxCharacters[i] = cell.effectiveValue!.stringValue!.length;
            }
        });

        const audienceLogData: sheets_v4.Schema$RowData[] = audience 
            ? audience?.map((member, i) => {

                const memberProperties = memberInformation.map((prop, i) => {
                    const data = prop == "Member No." 
                        ? i.toString()
                        : member.properties[prop].value?.toString() || "";
                    if(data.length > audienceLogMaxCharacters[i]) audienceLogMaxCharacters[i] = data.length;
                    return data;
                });

                const memberPoints = membershipPoints.map((point, i) => {
                    const data = member.points[point].toString();
                    if(data.length > audienceLogMaxCharacters[i + memberInformation.length + 1]) {
                        audienceLogMaxCharacters[i + memberInformation.length + 1] = data.length;
                    }
                    return data;
                });

                const eventsAttended = events 
                    ? events.map(event =>  member.eventsAttended[event._id.toHexString()] ? "X" : "")
                    : [""];

                return {
                    values: [ ...this.cellBuilder([...memberProperties, "", ...memberPoints, "", ...eventsAttended]) ]
                };
            })
            : [];
        
        // Resize each column of the Audience Log based on the max characters in each cell
        const columnMetadata: sheets_v4.Schema$DimensionProperties[] = audienceLogMaxCharacters.map((maxCharacters, i) => { 
            let pixelSize = 85;
            if(maxCharacters > 20) pixelSize = 200;
            else if(maxCharacters > 10) pixelSize = 110;
            else if(maxCharacters > 13) pixelSize = 160;
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
                    rowMetadata: [
                        { pixelSize: 110 },
                    ]
                }
            ],
            merges: [
                {
                    sheetId: 2,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: memberInformation.length + 1,
                },
                {
                    sheetId: 2,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: memberInformation.length + 1,
                    endColumnIndex: memberInformation.length + membershipPoints.length + 2,
                }
            ]
        };

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

        const requests: sheets_v4.Schema$Request[] = [
            {
                deleteDimension: {
                    range: {
                        sheetId: 0,
                        dimension: "COLUMNS",
                        startIndex: 5,
                        endIndex: 26,
                    }
                }
            },
            {
                deleteDimension: {
                    range: {
                        sheetId: 1,
                        dimension: "COLUMNS",
                        startIndex: 10,
                        endIndex: 26,
                    }
                }
            },
        ];

        if(audienceLogHeaders.values!.length < 26) {
            requests.push({
                deleteDimension: {
                    range: {
                        sheetId: 2,
                        dimension: "COLUMNS",
                        startIndex: columnMetadata.length,
                        endIndex: 26,
                    }
                }
            });
        }

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: createSheet.data.spreadsheetId!,
            requestBody: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: 0,
                                dimension: "COLUMNS",
                                startIndex: 5,
                                endIndex: 26,
                            }
                        }
                    },
                    {
                        deleteDimension: {
                            range: {
                                sheetId: 1,
                                dimension: "COLUMNS",
                                startIndex: 10,
                                endIndex: 26,
                            }
                        }
                    },
                ]
            }
        });

        await drive.files.update({
            fileId: createSheet.data.spreadsheetId!,
            addParents: PARENT_DRIVE_FOLDER_ID,
        });

        await this.troupeColl.updateOne({ _id: troupe._id }, { $set: { logSheetUri: createSheet.data.spreadsheetUrl } });
        return createSheet.data.spreadsheetUrl;
    }

    async deleteLog(troupe: WithId<TroupeSchema>): Promise<void> {
        const drive = await getDrive();
        const fileId = SHEETS_REGEX.exec(troupe.logSheetUri)?.groups?.["spreadsheetId"];
        if(fileId) await drive.files.delete({ fileId });
    }

    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#Request
    // 
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#UpdateSpreadsheetPropertiesRequest


    protected updateLogHelper(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<MemberSchema>[], eventsAttendedSchema: WithId<EventsAttendedBucketSchema>[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
}