import "dotenv/config";

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MONGODB_PASS, MONGODB_USER } from '../util/env';
import { MongoClient } from 'mongodb';

export default async function () {

    // Instantiate the MongoDB server
    const mongod = await MongoMemoryReplSet.create({ replSet: { auth: { enable: true, customRootName: MONGODB_USER, customRootPwd: MONGODB_PASS } } });
    const uri = mongod.getUri();

    // Connect to and ping the server to ensure everything is setup
    const client = new MongoClient(uri, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    process.env.MONGODB_URI = uri;
    console.log(uri);

    // Stop the server
    await client.close();
    await mongod.stop();
};