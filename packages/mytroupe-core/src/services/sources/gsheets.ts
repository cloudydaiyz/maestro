// Google Sheets event data source

import { WithId } from "mongodb";
import { EventSchema, TroupeSchema } from "../../types/core-types";
import { EventDataService, EventMap, GoogleSheetsQuestionToTypeMap, MemberMap } from "../../types/service-types";
import { SHEETS_REGEX } from "../../util/constants";

import { parse } from "csv-parse";
import { Readable } from "stream";
import assert from "assert";

export class GoogleSheetsEventDataService implements EventDataService {
    ready: Promise<void>;
    troupe: WithId<TroupeSchema>;
    events: EventMap;
    members: MemberMap;

    sheetData?: string[][];

    constructor(troupe: WithId<TroupeSchema>, events: EventMap, members: MemberMap) {
        this.troupe = troupe;
        this.events = events;
        this.members = members;
        this.ready = Promise.resolve();
    }

    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {
        const spreadsheetId = SHEETS_REGEX.exec(event.sourceUri)!.groups!["spreadsheetId"];
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
        
        try {
            // Fetch CSV content
            const response = await fetch(url);
            assert(response.ok, `Error fetching CSV: ${response.statusText}`);

            // Get CSV content as a string and convert the CSV string into a readable stream
            const readableStream = Readable.from(await response.text());

            // Create an array to store parsed CSV rows
            const results: string[][] = [];
            const columnToTypeMap: GoogleSheetsQuestionToTypeMap = {};

            const allFields = Object.keys(event.fieldToPropertyMap);

            // Pipe the readable stream into the CSV parser
            readableStream.pipe(parse({ delimiter: "," }))
                .on('data', (row: string[]) => {
                    row = row.map(r => r.trim()); // Trim whitespace from each cell
                    if(results.length == 0) {
                        row.forEach((label, i) => {
                            const property = event.fieldToPropertyMap[i]?.property;
                            event.fieldToPropertyMap[i] = { field: label.trim(), property: null };
                            if(!property) return;

                            // Ensure the given property is valid for the question, otherwise
                            // set the event property to null
                            const propertyType = this.troupe.memberPropertyTypes[property].slice(0, -1);
                            if(propertyType == "string") columnToTypeMap[i] = { string: true };
                            else if(propertyType == "number") columnToTypeMap[i] = { number: true };
                            else if(propertyType == "date") columnToTypeMap[i] = { date: true };
                        });
                    } else {
                        // First pass over the array
                        // Assert that all the values in the row are parsable to the type of its property
                        // If not, set the property to null
                    }
                    results.push(row.map(r => r.trim())); // Push each row to the results array
                })
                .on('end', () => {
                    console.log('Parsed CSV data:', results);
                    
                    // Iterate through the array and convert the data to the appropriate type

                });
        } catch(e) {

        }
    };
}