import { WithId } from "mongodb";
import { Attendee, ConsoleData, CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, Credentials, EventType, Member, PublicEvent, SpringplayAuthApi, SpringplayCoreApi, Troupe, TroupeDashboard, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "../types/api-types";
import { TroupeSchema, EventSchema, MemberSchema, AttendeeSchema } from "../types/core-types";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import path from "path";
import assert from "assert";

/** Catches and relays API client input based errors */ 
export class StringplayApiClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StringplayApiClientError";
    }
}

/** Provides method definitions for interacting with the API. */
export class StringplayApiClient implements SpringplayCoreApi, SpringplayAuthApi {
    uri: string;
    credentials?: Credentials;

    constructor(uri = "", accessToken?: string, refreshToken?: string) {
        this.uri = uri;
        if(accessToken && refreshToken) {
            this.credentials = {
                accessToken: accessToken,
                refreshToken: refreshToken,
            }
        }
    }

    /** 
     * Returns the headers to use for requests 
     * 
     * @param {boolean} requireAuth whether or not to check if this client is authenticated and, 
     * if so, add the authorization header
     */
    private headers(requireAuth: boolean): AxiosRequestConfig['headers'] {
        assert(this.credentials, new StringplayApiClientError("Authorization required for this command"))
        return { 
            ...(requireAuth && this.credentials ? {'Authorization': `Bearer ${this.credentials.accessToken}`} : {}), 
            "Content-Type": "application/json"
        };
    }

    /**
     * Attaches credentials to this client so that subsequent requests will use the given credentials
     * @param accessToken Access token
     * @param refreshToken Refresh token
     */
    addCredentials(accessToken: string, refreshToken: string): void {
        this.credentials = { accessToken, refreshToken }
    }

    register(username: string, email: string, password: string, troupeName: string): Promise<AxiosResponse<void>> {
        return axios.post(
            path.join(this.uri, '/auth', 'register'), 
            { username, email, password, troupeName },
            { headers: this.headers(false) },
        );
    }

    login(usernameOrEmail: string, password: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            path.join(this.uri, '/auth', 'login'), 
            { usernameOrEmail, password },
            { headers: this.headers(false) },
        );
    }

    refreshCredentials(refreshToken: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            path.join(this.uri, '/auth', 'refresh'), 
            { refreshToken },
            { headers: this.headers(false) },
        );
    }

    deleteUser(usernameOrEmail: string, password: string): Promise<AxiosResponse<void>> {
        return axios.post(
            path.join(this.uri, '/auth', 'delete'), 
            { usernameOrEmail, password },
            { headers: this.headers(false) },
        );
    }

    getConsoleData(troupeId: string): Promise<AxiosResponse<ConsoleData>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'console'),
            { headers: this.headers(true) },
        );
    }

    async getDashboard(troupeId: string): Promise<AxiosResponse<TroupeDashboard>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'dashboard'),
            { headers: this.headers(true) },
        );
    }

    async getTroupe(troupeId: string): Promise<AxiosResponse<Troupe>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId),
            { headers: this.headers(true) },
        );
    }

    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<AxiosResponse<Troupe>> {
        return axios.put(
            path.join(this.uri, '/t', troupeId),
            request,
            { headers: this.headers(true) },
        );
    }

    async createEvent(troupeId: string, request: CreateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.post(
            path.join(this.uri, '/t', troupeId, 'e'),
            request,
            { headers: this.headers(true) },
        );
    }

    async getEvent(eventId: string, troupeId: string): Promise<AxiosResponse<PublicEvent>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'e', eventId),
            { headers: this.headers(true) },
        );
    }

    async getEvents(troupeId: string): Promise<AxiosResponse<PublicEvent[]>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'e'),
            { headers: this.headers(true) },
        );
    }

    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.put(
            path.join(this.uri, '/t', troupeId, 'e', eventId),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteEvent(troupeId: string, eventId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            path.join(this.uri, '/t', troupeId, 'e', eventId),
            { headers: this.headers(true) },
        );
    }

    async createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.post(
            path.join(this.uri, '/t', troupeId, 'et'),
            request,
            { headers: this.headers(true) },
        );
    }

    async getEventTypes(troupeId: string): Promise<AxiosResponse<EventType[]>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'et'),
            { headers: this.headers(true) },
        );
    }

    async updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.put(
            path.join(this.uri, '/t', troupeId, 'et', eventTypeId),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteEventType(troupeId: string, eventTypeId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            path.join(this.uri, '/t', troupeId, 'et', eventTypeId),
            { headers: this.headers(true) },
        );
    }

    async createMember(troupeId: string, request: CreateMemberRequest): Promise<AxiosResponse<Member>> {
        return axios.post(
            path.join(this.uri, '/t', troupeId, 'a'),
            request,
            { headers: this.headers(true) },
        );
    }

    async getMember(memberId: string, troupeId: string): Promise<AxiosResponse<Member>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'm', memberId),
            { headers: this.headers(true) },
        );
    }

    async getAttendee(memberId: string, troupeId: string): Promise<AxiosResponse<Attendee>> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'a', memberId),
            { headers: this.headers(true) },
        );
    }

    async getAudience(troupeId: string): Promise<Member[]> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'm'),
            { headers: this.headers(true) },
        );
    }

    async getAttendees(troupeId: string): Promise<Attendee[]> {
        return axios.get(
            path.join(this.uri, '/t', troupeId, 'a'),
            { headers: this.headers(true) },
        );
    }

    async updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<Member> {
        return axios.put(
            path.join(this.uri, '/t', troupeId, 'm', memberId),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteMember(troupeId: string, memberId: string): Promise<void> {
        return axios.delete(
            path.join(this.uri, '/t', troupeId, 'm', memberId),
            { headers: this.headers(true) },
        );
    }

    async initiateSync(troupeId: string): Promise<void> {
        return axios.post(
            path.join(this.uri, '/t', troupeId, 'sync'),
            undefined,
            { headers: this.headers(true) },
        );
    }
}