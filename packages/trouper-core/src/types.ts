// All relevant interfaces and types

// import { Dayjs } from "dayjs";
// import { Group } from "./group.js";

export interface GenericMap<K> {
    [key: string]: K
}

export interface Member {
    memberId: number,
    firstName: string,
    lastName: string,
    utEid: string,
    email: string,
    phoneNumber: string,
    // birthday: Dayjs,
    major: string,
    graduationYear: number,
    fallPoints: number,
    springPoints: number,
    totalPoints: number
}

export interface EventType {
    id: number,
    name: string,
    points: number
}

export type MemberProperty = "First Name" | "Last Name" | "UT EID" | "Email"
    | "Phone Number" | "Birthday" | "Major" | "Graduation Year" | "";

export enum SourceType {
    GoogleForms = "GoogleForms",
    GoogleSheets = "GoogleSheets"
}

export interface QuestionPropertyMatch {
    questionId: string;
    property: MemberProperty;
}

// One question to one ID and vice versa
export interface QuestionData {
    questionIds: string[], // list of all question Ids
    questionIdToPropertyMap: GenericMap<MemberProperty> // maps question IDs to member properties
}

export interface Event {
    eventName: string,
    semester: string,
    // eventDate: Dayjs,
    eventType: EventType,
    source: string, // original link where the data came from
    sourceType: SourceType, // note that question IDs for this event depends on the source type
    attendees: GenericMap<Member>,
    sims: string, // sign in mapping string
    questionData: QuestionData, // container for question data
}

export interface GroupSettings {
    id: number,
    name: string,
    logSheetUri: string,
    version: string,
    simsIV: string,
    outputCapacity: number,
    outputRetentionPeriod: number
}

// Maps groups to a corresponding ID
export interface GroupMap {
    // [key: number]: Group
}