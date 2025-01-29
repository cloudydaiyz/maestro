import controllers from "@cloudydaiyz/stringplay-core";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
    const body = event.body ? JSON.parse(event.body) : {};
    const res = await controllers.apiController(event.path, event.httpMethod as any, event.headers, body);
    return { statusCode: res.status, headers: res.headers as any, body: JSON.stringify(res.body) };
}