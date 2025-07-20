import { SessionState, PlayerColor } from '../utils/types';
import { AppSession } from '@mentra/sdk';

export interface ChessSessionInfo {
    sessionId: string;
    userId: string;
    isConnected: boolean;
    state: SessionState;
    createdAt: Date;
    lastActivity: Date;
}

interface SessionEntry {
    info: ChessSessionInfo;
    state: SessionState;
    appSession: AppSession;
    cleanupFunctions: Array<() => void>;
    dashboardCleanup?: () => void;
}

export class SessionManager {
    private activeSessions: Map<string, SessionEntry> = new Map();

    constructor() {
        console.log('[SessionManager] Initialized');
    }

    /**
     * Initializes a new session with a starting state and data.
     */
    public initializeSession(sessionId: string, initialState: SessionState, userId: string, appSession: AppSession): ChessSessionInfo {
        if (this.activeSessions.has(sessionId)) {
            console.warn(`[SessionManager] Session ${sessionId} already initialized. Overwriting...`);
        }
        const now = new Date();
        const newSessionInfo: ChessSessionInfo = {
            sessionId,
            userId,
            isConnected: true,
            state: initialState,
            createdAt: now,
            lastActivity: now
        };
        this.activeSessions.set(sessionId, {
            info: newSessionInfo,
            state: initialState,
            appSession,
            cleanupFunctions: []
        });
        console.log(`[SessionManager] Session ${sessionId} initialized for user ${userId}.`);
        return newSessionInfo;
    }

    public getSessionInfo(sessionId: string): ChessSessionInfo | undefined {
        return this.activeSessions.get(sessionId)?.info;
    }

    public getState(sessionId: string): SessionState | undefined {
        return this.activeSessions.get(sessionId)?.state;
    }

    public setState(sessionId: string, state: SessionState): void {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            sessionEntry.state = state;
            sessionEntry.info.state = state;
            sessionEntry.info.lastActivity = new Date();
            console.log(`[SessionManager] Session ${sessionId} state updated.`);
        } else {
            console.warn(`[SessionManager] Attempt to set state for unknown session ${sessionId}`);
        }
    }

    public updateSessionInfo(sessionId: string, updates: Partial<ChessSessionInfo>): void {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            sessionEntry.info = { ...sessionEntry.info, ...updates };
            sessionEntry.info.lastActivity = new Date();
        } else {
            console.warn(`[SessionManager] Attempt to update info for unknown session ${sessionId}`);
        }
    }

    public removeSession(sessionId: string): void {
        const deleted = this.activeSessions.delete(sessionId);
        if (deleted) {
            console.log(`[SessionManager] Session ${sessionId} removed.`);
        }
    }

    public isSessionActive(sessionId: string): boolean {
        return this.activeSessions.has(sessionId);
    }

    public getAllSessionIds(): string[] {
        return Array.from(this.activeSessions.keys());
    }

    public getSession(sessionId: string): SessionEntry | undefined {
        return this.activeSessions.get(sessionId);
    }

    public getActiveSessionsCount(): number {
        return this.activeSessions.size;
    }

    public stopAllSessions(): void {
        this.activeSessions.clear();
        console.log('[SessionManager] All sessions stopped and cleared.');
    }
} 