import type { Attendee, BulkUpdateEventRequest, BulkUpdateEventResponse, BulkUpdateEventTypeRequest, BulkUpdateEventTypeResponse, BulkUpdateMemberRequest, BulkUpdateMemberResponse, ConsoleData, CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, Credentials, EventType, Member, PublicEvent, SpringplayAuthApi, SpringplayApi, Troupe, TroupeDashboard, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "@cloudydaiyz/stringplay-core/types/api";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

/** Assertion function defined outside of Node.js */
function assert(value: unknown, message?: string | Error): asserts value {
    if(!value) {
        if(message instanceof Error) throw message;
        if(typeof message == 'string') throw new Error(message);
        throw new Error('Assertion failed.');
    }
};

function getUrl(uri: string, path: string) {
    return (new URL(path, uri)).href;
}

/** Catches and relays API client input based errors */ 
export class StringplayApiClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StringplayApiClientError";
    }
}

/** Provides method definitions for interacting with the API. */
export class StringplayApiClient implements SpringplayApi, SpringplayAuthApi {
    readonly uri: string;
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
     * Returns the default headers to use for requests 
     * 
     * @param {boolean} requireAuth whether or not to check if this client is authenticated and, 
     * if so, add the authorization header
     */
    private headers(requireAuth: boolean): AxiosRequestConfig['headers'] {
        assert(!requireAuth || this.credentials, new StringplayApiClientError("Authorization required for this command"))
        return { 
            ...(requireAuth && this.credentials ? {'Authorization': `Bearer ${this.credentials.accessToken}`} : {}), 
            "Content-Type": "application/json",
        };
    }

    /**
     * Attaches credentials to this client so that subsequent requests will use the given credentials
     * @param accessToken Access token
     * @param refreshToken Refresh token
     */
    addCredentials(accessToken: string, refreshToken: string): void {
        this.credentials = { accessToken, refreshToken };
    }

    getCredentials(): Credentials | undefined {
        return this.credentials;
    }

    removeCredentials(): void {
        this.credentials = undefined;
    }

    register(username: string, email: string, password: string, troupeName: string, inviteCode?: string): Promise<AxiosResponse<void>> {
        return axios.post(
            getUrl(this.uri, '/auth/register'),
            { username, email, password, troupeName, inviteCode },
        );
    }

    login(usernameOrEmail: string, password: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            getUrl(this.uri, '/auth/login'),
            { usernameOrEmail, password },
        );
    }

    refreshCredentials(refreshToken: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            getUrl(this.uri, '/auth/refresh'),
            { refreshToken },
            // { headers: this.headers(false) },
        );
    }

    deleteUser(usernameOrEmail: string, password: string): Promise<AxiosResponse<void>> {
        return axios.post(
            getUrl(this.uri, '/auth/delete'),
            { usernameOrEmail, password },
            { headers: this.headers(false) },
        );
    }

    getConsoleData(troupeId: string): Promise<AxiosResponse<ConsoleData>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/console`),
            { headers: this.headers(true) },
        );
    }

    async getDashboard(troupeId: string): Promise<AxiosResponse<TroupeDashboard>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/dashboard`),
            { headers: this.headers(true) },
        );
    }

    async getTroupe(troupeId: string): Promise<AxiosResponse<Troupe>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}`),
            { headers: this.headers(true) },
        );
    }

    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<AxiosResponse<Troupe>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}`),
            request,
            { headers: this.headers(true) },
        );
    }

    async createEvent(troupeId: string, request: CreateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/e`),
            request,
            { headers: this.headers(true) },
        );
    }

    async createEvents(troupeId: string, requests: CreateEventRequest[]): Promise<AxiosResponse<PublicEvent[]>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/e/bulk`),
            requests,
            { headers: this.headers(true) },
        );
    }

    async getEvent(eventId: string, troupeId: string): Promise<AxiosResponse<PublicEvent>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/e/${eventId}`),
            { headers: this.headers(true) },
        );
    }

    async getEvents(troupeId: string): Promise<AxiosResponse<PublicEvent[]>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/e`),
            { headers: this.headers(true) },
        );
    }

    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/e/${eventId}`),
            request,
            { headers: this.headers(true) },
        );
    }

    async updateEvents(troupeId: string, request: BulkUpdateEventRequest): Promise<AxiosResponse<BulkUpdateEventResponse>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/e/bulk`),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteEvent(troupeId: string, eventId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            getUrl(this.uri, `/t/${troupeId}/e/${eventId}`),
            { headers: this.headers(true) },
        );
    }

    async deleteEvents(troupeId: string, eventIds: string[]): Promise<AxiosResponse<void>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/e/bulk/delete`),
            eventIds,
            { headers: this.headers(true) },
        );
    }

    async createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/et`),
            request,
            { headers: this.headers(true) },
        );
    }

    async createEventTypes(troupeId: string, requests: CreateEventTypeRequest[]): Promise<AxiosResponse<EventType[]>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/et/bulk`),
            requests,
            { headers: this.headers(true) },
        );
    }

    async getEventTypes(troupeId: string): Promise<AxiosResponse<EventType[]>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/et`),
            { headers: this.headers(true) },
        );
    }

    async updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/et/${eventTypeId}`),
            request,
            { headers: this.headers(true) },
        );
    }

    async updateEventTypes(troupeId: string, request: BulkUpdateEventTypeRequest): Promise<AxiosResponse<BulkUpdateEventTypeResponse>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/et/bulk`),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteEventType(troupeId: string, eventTypeId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            getUrl(this.uri, `/t/${troupeId}/et/${eventTypeId}`),
            { headers: this.headers(true) },
        );
    }

    async deleteEventTypes(troupeId: string, eventTypeIds: string[]): Promise<AxiosResponse<void>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/et/bulk/delete`),
            eventTypeIds,
            { headers: this.headers(true) },
        );
    }

    async createMember(troupeId: string, request: CreateMemberRequest): Promise<AxiosResponse<Member>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/m`),
            request,
            { headers: this.headers(true) },
        );
    }

    async createMembers(troupeId: string, requests: CreateMemberRequest[]): Promise<AxiosResponse<Member[]>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/m/bulk`),
            requests,
            { headers: this.headers(true) },
        );
    }

    async getMember(memberId: string, troupeId: string): Promise<AxiosResponse<Member>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/m/${memberId}`),
            { headers: this.headers(true) },
        );
    }

    async getAttendee(memberId: string, troupeId: string): Promise<AxiosResponse<Attendee>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/a/${memberId}`),
            { headers: this.headers(true) },
        );
    }

    async getAudience(troupeId: string): Promise<AxiosResponse<Member[]>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/m`),
            { headers: this.headers(true) },
        );
    }

    async getAttendees(troupeId: string): Promise<AxiosResponse<Attendee[]>> {
        return axios.get(
            getUrl(this.uri, `/t/${troupeId}/a`),
            { headers: this.headers(true) },
        );
    }

    async updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<AxiosResponse<Member>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/m/${memberId}`),
            request,
            { headers: this.headers(true) },
        );
    }

    async updateMembers(troupeId: string, request: BulkUpdateMemberRequest): Promise<AxiosResponse<BulkUpdateMemberResponse>> {
        return axios.put(
            getUrl(this.uri, `/t/${troupeId}/m/bulk`),
            request,
            { headers: this.headers(true) },
        );
    }

    async deleteMember(troupeId: string, memberId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            getUrl(this.uri, `/t/${troupeId}/m/${memberId}`),
            { headers: this.headers(true) },
        );
    }

    async deleteMembers(troupeId: string, memberIds: string[]): Promise<AxiosResponse<void>> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/m/bulk/delete`),
            memberIds,
            { headers: this.headers(true) },
        );
    }

    async initiateSync(troupeId: string): Promise<void> {
        return axios.post(
            getUrl(this.uri, `/t/${troupeId}/sync`),
            undefined,
            { headers: this.headers(true) },
        );
    }
}