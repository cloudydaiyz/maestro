import controllers from "@cloudydaiyz/stringplay-core";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
    const res = await controllers.apiController(event.path, event.httpMethod as any, event.headers, {});
    return { statusCode: res.status, headers: res.headers as any, body: JSON.stringify(res.body) };
}