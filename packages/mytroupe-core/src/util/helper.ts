// Helper functions

import { EventDataSource } from "../types/core-types";
import { FORMS_REGEX, FORMS_URL_TEMPL, SHEETS_REGEX, SHEETS_URL_TEMPL } from "./constants";

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
export function getDataSourceId(dataSource: EventDataSource, url: string) {
    let regex: RegExp;
    if(dataSource == "Google Sheets") regex = SHEETS_REGEX;
    else if(dataSource == "Google Forms") regex = FORMS_REGEX;
    else return "";
    return regex.exec(url)!.groups!["id"];
}