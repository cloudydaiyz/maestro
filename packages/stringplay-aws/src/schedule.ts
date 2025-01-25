import controllers from "@cloudydaiyz/stringplay-core";
import { Handler } from "aws-lambda";

export const handler: Handler = async (event) => controllers.scheduleController(event);