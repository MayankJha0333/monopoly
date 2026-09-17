import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, JoinResult, RoomSummary, ServerToClient } from '@shared/types';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

/**
 * In dev, Vite proxies /socket.io to the game server; in production the
 * server hosts the build, so the default origin is right either way.
 */
export const socket: GameSocket = io({
  autoConnect: true,
  withCredentials: true,
  transports: ['websocket', 'polling'],
});

const emit = socket as unknown as {
  emit: (event: string, ...args: unknown[]) => void;
};

export const listRooms = (): Promise<RoomSummary[]> =>
  new Promise((resolve) => emit.emit('room:list', resolve));

export const createRoom = (p: unknown): Promise<JoinResult> =>
  new Promise((resolve) => emit.emit('room:create', p, resolve));

export const joinRoom = (p: unknown): Promise<JoinResult> =>
  new Promise((resolve) => emit.emit('room:join', p, resolve));

export const quickMatch = (p: unknown): Promise<JoinResult> =>
  new Promise((resolve) => emit.emit('match:join', p, resolve));

export const rejoinRoom = (p: unknown): Promise<JoinResult> =>
  new Promise((resolve) => emit.emit('room:rejoin', p, resolve));

/** Fire-and-forget action helper for every non-acknowledged event. */
export const send = <K extends keyof ClientToServer>(
  event: K,
  ...args: Parameters<ClientToServer[K]>
): void => emit.emit(event as string, ...(args as unknown[]));
