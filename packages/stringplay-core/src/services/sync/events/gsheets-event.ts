// Google Sheets event data source

import { ObjectId, WithId } from "mongodb";
import { BaseMemberProperties, EventsAttendedBucketSchema, EventSchema, MemberPropertyValue, MemberSchema, TroupeLimit, TroupeSchema, VariableMemberProperties } from "../../../types/core-types";
import { EventDataMap, GoogleSheetsQuestionToTypeMap, AttendeeDataMap } from "../../../types/service-types";
import { SHEETS_REGEX } from "../../../util/constants";

import { parse } from "csv-parse";
import { Readable } from "stream";
import assert from "assert";
import { EventDataService } from "../../base";
import { getDataSourceId } from "../../../util/helper";
import { DateParser } from "../../../util/server/date-parser";

export class GoogleSheetsEventDataService extends EventDataService {
    results?: string[][];
    columnToTypeMap?: GoogleSheetsQuestionToTypeMap;
    containsMemberId?: boolean;
    
    constructor(troupe: WithId<TroupeSchema>, events: EventDataMap, members: AttendeeDataMap,
        currentLimits: TroupeLimit, incrementLimits: Partial<TroupeLimit>) { 
        super(troupe, events, members, currentLimits, incrementLimits);
    };

    init(): Promise<void> {
        return Promise.resolve();
    }

    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {
        const spreadsheetId = getDataSourceId("Google Sheets", event.sourceUri)!;
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
        
        try {
            // Fetch CSV content
            const response = await fetch(url);
            assert(response.ok, `Error fetching CSV: ${response.statusText}`);

            // Get CSV content as a string and convert the CSV string into a readable stream
            const readableStream = Readable.from(await response.text());

            // Create an array to store parsed CSV rows
            this.results = [];
            this.columnToTypeMap = {};

            // Pipe the readable stream into the CSV parser
            await new Promise<void>((resolve, reject) => {
                readableStream.pipe(parse({ delimiter: "," }))
                .on('data', row => this.synchronizeEvent(event, row))
                .on('end', () => { this.synchronizeAudience(event, lastUpdated); resolve() })
                .on('error', reject);
            });
        } catch(e) {
            this.eventMap[event.sourceUri].delete = true;
        }
    };

    protected synchronizeEvent(event: WithId<EventSchema>, row: string[]): void {
        assert(this.results && this.columnToTypeMap);
        const columnToTypeMap = this.columnToTypeMap;
        row = row.map(r => r.trim());

        if(this.results.length == 0) {
            row.forEach((label, i) => {
                const field = label.trim();
                
                // If there's no existing property, see if the troupe has a matcher that
                // matches with the field for this event
                const matcherId = this.getMatcherIndex(field);
                const matcherProperty = matcherId !== null ? this.troupe.fieldMatchers[matcherId].memberProperty : null;
                const property = event.fieldToPropertyMap[i]?.property || matcherProperty;

                // Init the updated field to property map
                const override = event.fieldToPropertyMap[i]?.override;
                event.fieldToPropertyMap[i] = { field, override, matcherId, property: null };

                if(!property) return;
                else if(property == "Member ID") this.containsMemberId = true;

                // Ensure the given property is valid for the question, otherwise set the event property to null
                const propertyType = this.troupe.memberPropertyTypes[property].slice(0, -1);
                if(propertyType == "string") columnToTypeMap[i] = { string: true };
                else if(propertyType == "number") columnToTypeMap[i] = { number: true };
                else if(propertyType == "date") columnToTypeMap[i] = { date: true };

                event.fieldToPropertyMap[i].property = property;
            });
        } else {
            row.forEach((value, i) => {
                const type = columnToTypeMap[i];
                const property = event.fieldToPropertyMap[i]?.property;
                if(!type) return;

                if(type.string && typeof value != "string") {
                    event.fieldToPropertyMap[i].property = null;
                } else if(type.number && isNaN(Number(value))) {
                    event.fieldToPropertyMap[i].property = null;
                } else if(type.date && !DateParser.parse(value)) {
                    event.fieldToPropertyMap[i].property = null;
                } else {
                    // Valid property; return
                    return;
                }

                // The event doesn't contain the member ID property if the property is invalid
                if(property == "Member ID") this.containsMemberId = false;
            });
        }

        // Push each row to the results array
        this.results.push(row); 
    }

    protected synchronizeAudience(event: WithId<EventSchema>, lastUpdated: Date): void {
        assert(this.results);
        const troupeId = this.troupe._id.toHexString();
        if(!this.containsMemberId) return;

        // Remove the fields that aren't set in the event anymore
        const allFields = Object.keys(event.fieldToPropertyMap);
        for(const oldField of allFields) {
            const numericalField = Number(oldField);
            if(Number.isNaN(numericalField) || numericalField < 0 || numericalField >= this.results[0].length) {
                delete event.fieldToPropertyMap[oldField];
            }
        }
        
        // Iterate through the array and convert the data to the appropriate type
        this.results.forEach((values, i) => {
            if(i == 0) return;

            // Initialize member properties
            const properties = {} as BaseMemberProperties & VariableMemberProperties;
            for(const prop in this.troupe.memberPropertyTypes) {
                properties[prop] = { value: null, override: false };
            }

            // Initialize a new member
            let member: WithId<MemberSchema> = {
                _id: new ObjectId(),
                troupeId,
                lastUpdated,
                properties,
                points: { "Total": 0 },
            };
            let eventsAttended: typeof this.attendeeMap[string]["eventsAttended"] = [{
                eventId: event._id.toHexString(),
                typeId: event.eventTypeId,
                value: event.value,
                startDate: event.startDate,
            }];
            let eventsAttendedDocs: WithId<EventsAttendedBucketSchema>[] = [];
            let fromColl = false;
            let isNewMember = true;

            // Iterate through the values and assign them to the appropriate property
            values.forEach((rawValue, i) => {
                const property = event.fieldToPropertyMap[i]?.property;
                if(!property) return;

                const propertyType = this.troupe.memberPropertyTypes[property].slice(0, -1);
                let value = rawValue.trim() as MemberPropertyValue;
                if(propertyType == "number") value = Number(rawValue);
                else if(propertyType == "date") value = DateParser.parse(rawValue)!.toDate();

                if(property == "Member ID") {
                    const existingMember = this.attendeeMap[value as string];
                    
                    // If the member already exists, use the existing member and copy over any new properties
                    if(existingMember) {
                        for(const prop in member.properties) {
                            if(!existingMember.member.properties[prop]) {
                                existingMember.member.properties[prop] = member.properties[prop];
                            }
                        }
                        member = existingMember.member;
                        eventsAttended = existingMember.eventsAttended.concat(eventsAttended);
                        eventsAttendedDocs = existingMember.eventsAttendedDocs;
                        fromColl = existingMember.fromColl;
                        isNewMember = false;
                    }
                }

                member.properties[property] = { value, override: false };
            });

            // Update the member's points
            for(const pointType in this.troupe.pointTypes) {
                const range = this.troupe.pointTypes[pointType];
                if(!member.points[pointType]) member.points[pointType] = 0;
                if(lastUpdated >= range.startDate && lastUpdated <= range.endDate) {
                    member.points[pointType] += event.value;
                }
            }

            if(isNewMember && this.currentLimits.membersLeft + this.incrementLimits.membersLeft! == 0) {
                return;
            }

            // Add the member to the list of members.
            this.attendeeMap[member.properties["Member ID"].value] = { 
                member, eventsAttended, eventsAttendedDocs, fromColl, delete: false 
            };
            this.incrementLimits.membersLeft! -= 1;
        });
    }
}