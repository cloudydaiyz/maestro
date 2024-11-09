// Implementation for the DateParser class
import dayjs, { Dayjs } from "dayjs";

/** Standardized date parsing */
export class DateParser {
    private date: Dayjs;
    /** Supported date formats */
    public static formats = [
        "M/D/YYYY",
        "M/D/YYYY H:mm:ss",
        "MM-DD",
        "YYYY-MM-DD",
        "MM-DD HH:MM",
        "YYYY-MM-DD HH:MM"
    ] as const;

    constructor(date: Date | Dayjs) {
        this.date = dayjs(date);
    }

    /** 
     * Parses the input string into a DateParser object using one of the supported formats (see {@link DateParser.formats}). 
     * Returns null if the input doesn't match any of the formats.
     */
    static parse(input: string): DateParser | null {
        for(const format of DateParser.formats) {
            const d = dayjs(input, format, true);
            if(d.isValid()) return new DateParser(d);
        }
        return null;
    }

    /** Stringified date as `MM-DD-YYYY` format */
    toString(): string {
        return dayjs(this.date).format("MM-DD-YYYY");
    }

    static toString(date: Date | Dayjs): string {
        return (new DateParser(date)).toString();
    }

    toDate(): Date {
        return this.date.toDate();
    }

    toDayJs(): Dayjs {
        return this.date;
    }
}