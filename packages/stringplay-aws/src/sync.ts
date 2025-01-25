import controllers from "@cloudydaiyz/stringplay-core";
import { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
    for(const record of event.Records) {
        await controllers.syncController({ troupeId: record.body });
    }
}