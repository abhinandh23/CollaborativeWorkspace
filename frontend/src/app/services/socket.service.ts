import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface RemoteCodeChangeEvent {
  snippetId: string;
  code: string;
  updatedAt: string;
}

export interface SnippetVersionCreatedEvent {
  snippetId: string;
  version: {
    code: string;
    timestamp: string;
  };
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket?: Socket;
  private readonly socketUrl =
    (environment as { socketUrl?: string }).socketUrl ?? 'http://localhost:5000';

  private getSocket(): Socket {
    if (!this.socket) {
      this.socket = io(this.socketUrl, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: true
      });
    }
    return this.socket;
  }

  connect(): void {
    const socket = this.getSocket();
    if (!socket.connected) {
      socket.connect();
    }
  }

  disconnect(): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }
  }

  joinSnippet(snippetId: string): void {
    this.getSocket().emit('join-snippet', snippetId);
  }

  leaveSnippet(snippetId: string): void {
    this.getSocket().emit('leave-snippet', snippetId);
  }

  emitCodeChange(snippetId: string, code: string): void {
    this.getSocket().emit('code-change', { snippetId, code });
  }

  onRemoteCodeChange(): Observable<RemoteCodeChangeEvent> {
    const socket = this.getSocket();

    return new Observable<RemoteCodeChangeEvent>((observer) => {
      const handler = (payload: RemoteCodeChangeEvent) => observer.next(payload);
      socket.on('remote-code-change', handler);

      return () => {
        socket.off('remote-code-change', handler);
      };
    });
  }

  onSnippetVersionCreated(): Observable<SnippetVersionCreatedEvent> {
    const socket = this.getSocket();

    return new Observable<SnippetVersionCreatedEvent>((observer) => {
      const handler = (payload: SnippetVersionCreatedEvent) => observer.next(payload);
      socket.on('snippet-version-created', handler);

      return () => {
        socket.off('snippet-version-created', handler);
      };
    });
  }
}
