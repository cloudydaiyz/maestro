import "dotenv/config";

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MONGODB_PASS, MONGODB_USER } from '../util/env';
import { MongoClient } from 'mongodb';
import { BaseService } from "../services/base-service";

export default function () {
    let mongod: MongoMemoryReplSet;
    const resources: BaseService[] = [];

    // Start the server
    beforeAll(async () => {
        mongod = await MongoMemoryReplSet.create({ replSet: { auth: { enable: true, customRootName: MONGODB_USER, customRootPwd: MONGODB_PASS } } });
        const uri = mongod.getUri();

        // Connect to and ping the server to ensure everything is setup
        const client = new MongoClient(uri, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        await client.close();

        process.env.MONGODB_URI = uri;
    })
    
    afterEach(async () => {
        await Promise.all(resources.map(r => r.close()));
    });

    // Stop the server
    afterAll(async () => {
        await mongod.stop();
    });

    return resources;
};