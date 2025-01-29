// Implementation for client-facing authentication controller methods

import { BaseDbService } from "./base";
import { Collection, ObjectId, WithId } from "mongodb";
import { InviteCodeSchema, UserSchema } from "../types/core-types";
import { DB_NAME, EMAIL_REGEX, TOKEN_HEADER_REGEX } from "../util/constants";
import { CoreService } from "./core";
import { AuthenticationError, ClientError } from "../util/error";
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } from "../util/env";
import { arrayToObject } from "../util/helper";

import zxcvbn from "zxcvbn";
import bcrypt from "bcryptjs";
import assert from "assert";
import jwt from "jsonwebtoken";
import { AccessTokenPayload, RefreshTokenPayload, Credentials, AuthorizationHeader, AuthenticationEndpoints } from "../types/api-types";
import { LimitService } from "./limits";

/**
 * User authentication service, responsible for creating, validating, and refreshing user sessions.
 * 
 * **FUTURE:**
 * - Recycle keys to encrypt / decrypt tokens daily
 * - Recycle keys to encrypt / decrypt passwords weekly
 * - Convert JWTs to session tokens with refresh token families to allow for revocation
 */
export class AuthService extends BaseDbService implements AuthenticationEndpoints {
    readonly userColl: Collection<UserSchema>;
    readonly inviteCodeColl: Collection<InviteCodeSchema>;

    constructor() { 
        super();
        this.userColl = this.client.db(DB_NAME).collection("users");
        this.inviteCodeColl = this.client.db(DB_NAME).collection("inviteCodes");
    }

    /** Generates a new access token */
    private async generateAccessToken(user: WithId<UserSchema> | string): Promise<string> {
        if(typeof user == "string") {
            const findUser = await this.userColl.findOne({ _id: new ObjectId(user) });
            assert(user, new ClientError("User not found"));
            user = findUser!;
        }

        const troupeAccess = arrayToObject<UserSchema["troupeAccess"][number], { [troupeId: string]: number }>(
            user.troupeAccess, (val) => { return [val.troupeId, val.accessLevel] }
        );

        const accessTokenPayload: AccessTokenPayload = {
            userId: user._id.toHexString(),
            troupeId: user.troupeId,
            [`${user.troupeId}`]: 0, 
            ...troupeAccess,
        };
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

    async register(username: string, email: string, password: string, troupeName: string, inviteCode?: string): Promise<void> {
        assert(EMAIL_REGEX.test(email), new ClientError("Invalid email"));
        assert(zxcvbn(password).score >= 3, new ClientError("Password is too weak"));
        assert(!(await this.userColl.findOne({ $or: [ {email}, {username} ] })), new ClientError("User already exists"));

        const limits = await LimitService.create();
        const core = await CoreService.create();
        assert(!(await core.getTroupeByName(troupeName)), new ClientError("Troupe already exists"));

        if(inviteCode) {
            const hasInviteCode = await this.inviteCodeColl.findOne(
                { inviteCodes: inviteCode }, 
            );
            assert(hasInviteCode, new ClientError("Invalid invite code"));
        } else {
            const usersLeftSuccess = await limits.incrementGlobalLimit({ uninvitedUsersLeft: -1 });
            assert(usersLeftSuccess, new ClientError("We have reached the maximum capacity for "
                + "uninvited user creation today. Please try again tomorrow."));
        }

        const [hashedPassword, troupeId] = await Promise.all([
            bcrypt.hash(password, 10),
            core.createTroupe({ name: troupeName }, true),
        ]);
        await limits.initTroupeLimits(troupeId, inviteCode !== undefined);

        const insertUser = await this.userColl.insertOne({ 
            username, email, hashedPassword, troupeId, 
            troupeAccess: [], 
            createdAt: new Date(),
        });
        assert(insertUser.acknowledged, "Failed to create user");

        // Assign invite code to the troupe, if applicable
        if(inviteCode) {
            const updateInviteCodes = await this.inviteCodeColl.updateOne(
                { inviteCodes: inviteCode }, 
                { 
                    $pull: { inviteCodes: inviteCode },
                    $set: { [troupeId]: inviteCode },
                }
            );
            assert(updateInviteCodes.modifiedCount == 1, "Unsuccessful invite code update");
        }
    }
    
    /** Creates a new user session and returns the associated access and refresh tokens */
    async login(usernameOrEmail: string, password: string): Promise<Credentials> {
        const user = await this.userColl.findOne({ $or: [{email: usernameOrEmail}, {username: usernameOrEmail}], });
        assert(user, new ClientError("Invalid credentials"));
        assert(await bcrypt.compare(password, user.hashedPassword), new ClientError("Invalid credentials"));

        const [accessToken, refreshToken] = await Promise.all([this.generateAccessToken(user), this.generateRefreshToken(user)]);
        return { accessToken, refreshToken };
    }

    async refreshCredentials(refreshToken: string): Promise<Credentials> {
        const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET!) as RefreshTokenPayload;
        const user = await this.userColl.findOne({ _id: new ObjectId(payload.userId) });
        assert(user != null, new ClientError("Invalid refresh token"));

        const [accessToken, newRefreshToken] = await Promise.all([this.generateAccessToken(user), this.generateRefreshToken(user)]);
        return { accessToken, refreshToken: newRefreshToken };
    }

    async deleteUser(usernameOrEmail: string, password: string): Promise<void> {
        assert(this.login(usernameOrEmail, password), new ClientError("Invalid credentials"));
        const deletedUser = await this.userColl.findOneAndDelete({ $or: [{email: usernameOrEmail}, {username: usernameOrEmail}] });
        assert(deletedUser, new ClientError("User not found"));
        await CoreService.create().then(c => c.deleteTroupe(deletedUser.troupeId));
    }

    /** 
     * Populates this service with the token obtained from the "Authorization" header. 
     * Returns this service to allow for chaining.
     */
    fromHeaders(headers: AuthorizationHeader): AccessTokenPayload | null {
        const authHeader = headers["Authorization"] || headers["authorization"];
        if(!authHeader) return null;
    
        const token = TOKEN_HEADER_REGEX.exec(authHeader)?.groups?.token;
        if(!token) return null;
        
        return this.extractAccessTokenPayload(token);
    }

    /** Extracts the payload from an access token if valid, null otherwise */
    extractAccessTokenPayload(accessToken: string): AccessTokenPayload | null {
        try {
            assert(accessToken, new AuthenticationError("Missing access token"));
            const payload = jwt.verify(accessToken, ACCESS_TOKEN_SECRET!);
            assert(typeof payload == "object" && typeof payload.userId == "string" && typeof payload.troupeId == "string");
            return payload as AccessTokenPayload;
        } catch(e) {
            return null;
        }
    }

    /** Validates a given access token */
    validate(accessToken: AccessTokenPayload | null, troupeId?: string, accessLevel = 0): boolean {
        if(!accessToken) return false;
        try {
            assert(!troupeId || typeof accessToken[troupeId] == "number", new ClientError("Invalid access token"));
            return troupeId ? accessToken[troupeId] as number >= accessLevel : true;
        } catch(e) {
            return false;
        }
    }

    /** Validates that the user has an invite code */
    async hasInviteCode(accessToken: AccessTokenPayload | null): Promise<boolean> {
        if(!accessToken) return false;

        const inviteCodeDoc = await this.inviteCodeColl.findOne(
            { [`usedInviteCodes.${accessToken.troupeId}`]: { $exists: true } }, 
            { projection: { _id: 1 } }
        );
        return inviteCodeDoc !== null;
    }
}