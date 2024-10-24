import { BaseDbService } from "./base";
import { Collection, ObjectId, WithId } from "mongodb";
import { UserSchema } from "../types/core-types";
import { DB_NAME, EMAIL_REGEX, TOKEN_HEADER_REGEX } from "../util/constants";
import { TroupeCoreService } from "./core";
import { AuthenticationError, ClientError } from "../util/error";
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } from "../util/env";
import { arrayToObject } from "../util/helper";

import zxcvbn from "zxcvbn";
import bcrypt from "bcrypt";
import assert from "assert";
import jwt from "jsonwebtoken";

type AccessTokenPayload = {
    userId: string,
    troupeId: string,
} & { 
    // List of troupe IDs the user has access to and their role
    [troupeId: string]: number 
};

type RefreshTokenPayload = {
    userId: string,
}

type Credentials = { accessToken: string, refreshToken: string };

/**
 * User authentication service, responsible for creating, validating, and refreshing user sessions.
 * 1. Encrypt passwords at rest
 * 2. Recycle keys to encrypt / decrypt tokens daily
 * 3. Recycle keys to encrypt / decrypt passwords weekly
 * 
 * **FUTURE:**
 * - Convert JWTs to session tokens with refresh token families to allow for revocation
 */
export class AuthService extends BaseDbService {
    userColl: Collection<UserSchema>;
    currentToken: string | null = null;

    constructor() { 
        super();
        this.userColl = this.client.db(DB_NAME).collection("users");
    }

    /** Generates a new access token */
    private async generateAccessToken(user: WithId<UserSchema> | string): Promise<string> {
        if(typeof user == "string") {
            const findUser = await this.userColl.findOne({ _id: new ObjectId(user) });
            assert(user, new ClientError("User not found"));
            user = findUser!;
        }

        const accessTokenPayload = {
            [`${user.troupeId}`]: 0, 
            ...arrayToObject(user.troupeAccess, (val) => [val.troupeId, val.accessLevel]),
            userId: user._id.toHexString(),
        } as AccessTokenPayload;
        return jwt.sign(accessTokenPayload, ACCESS_TOKEN_SECRET!, { expiresIn: "30m" });
    }

    /** Generates a new refresh token */
    private async generateRefreshToken(user: WithId<UserSchema> | string): Promise<string> {
        if(typeof user == "string") {
            const findUser = await this.userColl.findOne({ _id: new ObjectId(user) });
            assert(user, new ClientError("User not found"));
            user = findUser!;
        }

        const refreshTokenPayload = { userId: user._id.toHexString() } as RefreshTokenPayload;
        return jwt.sign(refreshTokenPayload, REFRESH_TOKEN_SECRET!, { expiresIn: "7d" });
    }

    /** Creates a new account with an associated troupe */
    async register(username: string, email: string, password: string, troupeName: string): Promise<string> {
        assert(EMAIL_REGEX.test(email), new ClientError("Invalid email"));
        assert(zxcvbn(password).score >= 3, new ClientError("Password is too weak"));
        assert(!(await this.userColl.findOne({ $or: [ {email}, {username} ] })), new ClientError("User already exists"));

        const core = await TroupeCoreService.create();
        assert(!(await core.getTroupeByName(troupeName)), new ClientError("Troupe already exists"));

        const [hashedPassword, troupeId] = await Promise.all([
            bcrypt.hash(password, 10),
            core.createTroupe({ name: troupeName }, true),
        ]);

        const insertUser = await this.userColl.insertOne({ username, email, hashedPassword, troupeId, troupeAccess: [], createdAt: new Date() });
        assert(insertUser.acknowledged, "Failed to create user");

        return troupeId;
    }
    
    /** Creates a new user session and returns the associated access and refresh tokens */
    async login(usernameOrEmail: string, password: string): Promise<Credentials> {
        const user = await this.userColl.findOne({ $or: [{email: usernameOrEmail}, {username: usernameOrEmail}], });
        assert(user, new ClientError("Invalid credentials"));
        assert(await bcrypt.compare(password, user.hashedPassword), new ClientError("Invalid credentials"));

        const [accessToken, refreshToken] = await Promise.all([this.generateAccessToken(user), this.generateRefreshToken(user)]);
        return { accessToken, refreshToken };
    }

    /** Validates a given access token */
    validate(accessToken = this.currentToken, troupeId?: string, accessLevel = 0): boolean {
        if(accessToken == null) accessToken = this.currentToken;
        if(!accessToken) return false;

        try {
            const payload = jwt.verify(accessToken, ACCESS_TOKEN_SECRET!) as AccessTokenPayload;
            return troupeId ? payload[troupeId] >= accessLevel : true;
        } catch(e) {
            return false;
        }
    }

    /** Refreshes access credentials */
    async refreshCredentials(refreshToken: string): Promise<Credentials> {
        const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET!) as RefreshTokenPayload;
        const user = await this.userColl.findOne({ _id: new ObjectId(payload.userId) });
        assert(user != null, new ClientError("Invalid refresh token"));

        const [accessToken, newRefreshToken] = await Promise.all([this.generateAccessToken(user), this.generateRefreshToken(user)]);
        return { accessToken, refreshToken: newRefreshToken };
    }

    /** Deletes the account & troupe associated with the account */
    async deleteUser(usernameOrEmail: string, password: string): Promise<void> {
        assert(this.login(usernameOrEmail, password), new ClientError("Invalid credentials"));
        const deletedUser = await this.userColl.findOneAndDelete({ $or: [{email: usernameOrEmail}, {username: usernameOrEmail}] });
        assert(deletedUser, new ClientError("User not found"));
        await TroupeCoreService.create().then(c => c.deleteTroupe(deletedUser.troupeId));
    }

    /** 
     * Populates this service with the token obtained from the "Authorization" header. 
     * Returns this service to allow for chaining.
     */
    fromHeaders(headers: {"Authorization"?: string}): AuthService {
        const authHeader = headers["Authorization"];
        assert(authHeader, new AuthenticationError("Missing Authorization header"));
    
        const token = TOKEN_HEADER_REGEX.exec(authHeader)?.groups?.token;
        assert(token, new AuthenticationError("Invalid Authorization header"));
        
        this.currentToken = token;
        return this;
    }
}