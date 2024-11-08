import { Attendee, ConsoleData, CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, Credentials, EventType, Member, PublicEvent, SpringplayAuthApi, SpringplayCoreApi, Troupe, TroupeDashboard, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "@cloudydaiyz/stringplay-core/types/api";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import path from "path";
import assert from "assert";

import { PathParsers } from "@cloudydaiyz/stringplay-core/routes";

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
            "Content-Type": "application/json",
            // "Accept": "application/json"
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
            path.join(this.uri, PathParsers.Register.build()), 
            { username, email, password, troupeName },
            { headers: this.headers(false) },
        );
    }

    login(usernameOrEmail: string, password: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            path.join(this.uri, PathParsers.Login.build()), 
            { usernameOrEmail, password },
            { headers: this.headers(false) },
        );
    }

    refreshCredentials(refreshToken: string): Promise<AxiosResponse<Credentials>> {
        return axios.post(
            path.join(this.uri, PathParsers.RefreshCredentials.build()), 
            { refreshToken },
            { headers: this.headers(false) },
        );
    }

    deleteUser(usernameOrEmail: string, password: string): Promise<AxiosResponse<void>> {
        return axios.post(
            path.join(this.uri, PathParsers.DeleteUser.build()), 
            { usernameOrEmail, password },
            { headers: this.headers(false) },
        );
    }

    getConsoleData(troupeId: string): Promise<AxiosResponse<ConsoleData>> {
        return axios.get(
            path.join(this.uri, PathParsers.Console.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    getDashboard(troupeId: string): Promise<AxiosResponse<TroupeDashboard>> {
        return axios.get(
            path.join(this.uri, PathParsers.Dashboard.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    getTroupe(troupeId: string): Promise<AxiosResponse<Troupe>> {
        return axios.get(
            path.join(this.uri, PathParsers.Troupe.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<AxiosResponse<Troupe>> {
        return axios.put(
            path.join(this.uri, PathParsers.Troupe.build({ troupeId })),
            request,
            { headers: this.headers(true) },
        );
    }

    createEvent(troupeId: string, request: CreateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.post(
            path.join(this.uri, PathParsers.Events.build({ troupeId })),
            request,
            { headers: this.headers(true) },
        );
    }

    getEvent(eventId: string, troupeId: string): Promise<AxiosResponse<PublicEvent>> {
        return axios.get(
            path.join(this.uri, PathParsers.Event.build({ troupeId, eventId })),
            { headers: this.headers(true) },
        );
    }

    getEvents(troupeId: string): Promise<AxiosResponse<PublicEvent[]>> {
        return axios.get(
            path.join(this.uri, PathParsers.Events.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<AxiosResponse<PublicEvent>> {
        return axios.put(
            path.join(this.uri, PathParsers.Event.build({ troupeId, eventId })),
            request,
            { headers: this.headers(true) },
        );
    }

    deleteEvent(troupeId: string, eventId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            path.join(this.uri, PathParsers.Event.build({ troupeId, eventId })),
            { headers: this.headers(true) },
        );
    }

    createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.post(
            path.join(this.uri, PathParsers.EventTypes.build({ troupeId })),
            request,
            { headers: this.headers(true) },
        );
    }

    getEventTypes(troupeId: string): Promise<AxiosResponse<EventType[]>> {
        return axios.get(
            path.join(this.uri, PathParsers.EventTypes.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<AxiosResponse<EventType>> {
        return axios.put(
            path.join(this.uri, PathParsers.EventType.build({ troupeId, eventTypeId })),
            request,
            { headers: this.headers(true) },
        );
    }

    deleteEventType(troupeId: string, eventTypeId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            path.join(this.uri, PathParsers.EventType.build({ troupeId, eventTypeId })),
            { headers: this.headers(true) },
        );
    }

    createMember(troupeId: string, request: CreateMemberRequest): Promise<AxiosResponse<Member>> {
        return axios.post(
            path.join(this.uri, PathParsers.Audience.build({ troupeId })),
            request,
            { headers: this.headers(true) },
        );
    }

    getMember(memberId: string, troupeId: string): Promise<AxiosResponse<Member>> {
        return axios.get(
            path.join(this.uri, PathParsers.Member.build({ troupeId, memberId })),
            { headers: this.headers(true) },
        );
    }

    getAttendee(memberId: string, troupeId: string): Promise<AxiosResponse<Attendee>> {
        return axios.get(
            path.join(this.uri, PathParsers.Member.build({ troupeId, memberId })),
            { headers: this.headers(true) },
        );
    }

    getAudience(troupeId: string): Promise<AxiosResponse<Member[]>> {
        return axios.get(
            path.join(this.uri, PathParsers.Audience.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    getAttendees(troupeId: string): Promise<AxiosResponse<Attendee[]>> {
        return axios.get(
            path.join(this.uri, PathParsers.Attendees.build({ troupeId })),
            { headers: this.headers(true) },
        );
    }

    updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<AxiosResponse<Member>> {
        return axios.put(
            path.join(this.uri, PathParsers.Member.build({ troupeId, memberId })),
            request,
            { headers: this.headers(true) },
        );
    }

    deleteMember(troupeId: string, memberId: string): Promise<AxiosResponse<void>> {
        return axios.delete(
            path.join(this.uri, PathParsers.Member.build({ troupeId, memberId })),
            { headers: this.headers(true) },
        );
    }

    initiateSync(troupeId: string): Promise<void> {
        return axios.post(
            path.join(this.uri, PathParsers.Sync.build({ troupeId })),
            undefined,
            { headers: this.headers(true) },
        );
    }
}