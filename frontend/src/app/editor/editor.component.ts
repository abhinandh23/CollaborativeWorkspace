import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, filter, takeUntil } from 'rxjs';
import { Snippet, SnippetHistoryEntry, SnippetService } from '../services/snippet.service';
import { RemoteCodeChangeEvent, SocketService } from '../services/socket.service';

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.css']
})
export class EditorComponent implements OnInit, OnDestroy {
  snippetId: string | null = null;
  title = 'Untitled Snippet';
  language = 'typescript';
  code = '// Start collaborating here...';
  history: SnippetHistoryEntry[] = [];

  isSaving = false;
  statusMessage = '';

  editorOptions: Record<string, unknown> = {
    theme: 'vs-dark',
    language: this.language,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    scrollBeyondLastLine: false,
    baseUrl: '/assets/monaco-editor/min/'
  };

  private readonly destroy$ = new Subject<void>();
  private readonly localCodeChanges$ = new Subject<string>();
  private suppressNextBroadcast = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly snippetService: SnippetService,
    private readonly socketService: SocketService
  ) {}

  ngOnInit(): void {
    this.socketService.connect();
    this.handleRouteChanges();
    this.handleLocalCodeBroadcast();
    this.handleRemoteCodeUpdates();
    this.handleVersionEvents();
  }

  ngOnDestroy(): void {
    if (this.snippetId) {
      this.socketService.leaveSnippet(this.snippetId);
    }

    this.destroy$.next();
    this.destroy$.complete();
    this.socketService.disconnect();
  }

  onCodeChanged(nextCode: string): void {
    this.code = nextCode ?? '';

    if (this.suppressNextBroadcast) {
      this.suppressNextBroadcast = false;
      return;
    }

    this.localCodeChanges$.next(this.code);
  }

  saveSnippet(): void {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.statusMessage = 'Saving...';

    if (this.snippetId) {
      this.snippetService
        .saveNewVersion(this.snippetId, {
          code: this.code,
          title: this.title,
          language: this.language
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (snippet) => this.afterSave(snippet, 'Saved as a new version.'),
          error: () => this.onSaveError()
        });

      return;
    }

    this.snippetService
      .createSnippet({
        title: this.title,
        language: this.language,
        code: this.code
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (snippet) => {
          this.snippetId = snippet._id;
          this.socketService.joinSnippet(snippet._id);
          this.afterSave(snippet, 'Snippet created and first version saved.');
        },
        error: () => this.onSaveError()
      });
  }

  private handleRouteChanges(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const nextSnippetId = params.get('id');

      if (this.snippetId && this.snippetId !== nextSnippetId) {
        this.socketService.leaveSnippet(this.snippetId);
      }

      if (!nextSnippetId) {
        this.snippetId = null;
        this.history = [];
        return;
      }

      this.snippetId = nextSnippetId;
      this.socketService.joinSnippet(nextSnippetId);
      this.loadSnippet(nextSnippetId);
      this.loadHistory(nextSnippetId);
    });
  }

  private handleLocalCodeBroadcast(): void {
    this.localCodeChanges$
      .pipe(
        debounceTime(150),
        distinctUntilChanged(),
        filter(() => Boolean(this.snippetId)),
        takeUntil(this.destroy$)
      )
      .subscribe((latestCode) => {
        this.socketService.emitCodeChange(this.snippetId as string, latestCode);
      });
  }

  private handleRemoteCodeUpdates(): void {
    this.socketService
      .onRemoteCodeChange()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: RemoteCodeChangeEvent) => {
        if (!this.snippetId || event.snippetId !== this.snippetId) {
          return;
        }

        if (event.code === this.code) {
          return;
        }

        this.suppressNextBroadcast = true;
        this.code = event.code;
        this.statusMessage = 'Live update received.';
      });
  }

  private handleVersionEvents(): void {
    this.socketService
      .onSnippetVersionCreated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (!this.snippetId || event.snippetId !== this.snippetId) {
          return;
        }

        this.loadHistory(this.snippetId);
      });
  }

  private loadSnippet(snippetId: string): void {
    this.snippetService
      .getSnippet(snippetId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (snippet) => this.applySnippet(snippet),
        error: () => {
          this.statusMessage = 'Failed to load snippet.';
        }
      });
  }

  private loadHistory(snippetId: string): void {
    this.snippetService
      .getHistory(snippetId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.history = response.history;
        },
        error: () => {
          this.history = [];
        }
      });
  }

  private applySnippet(snippet: Snippet): void {
    this.title = snippet.title;
    this.language = snippet.language;

    this.editorOptions = {
      ...this.editorOptions,
      language: this.language
    };

    const latestVersion =
      snippet.latestVersion ?? snippet.versions[snippet.versions.length - 1] ?? null;

    if (latestVersion) {
      this.code = latestVersion.code;
    }
  }

  private afterSave(snippet: Snippet, message: string): void {
    this.applySnippet(snippet);
    this.loadHistory(snippet._id);
    this.statusMessage = message;
    this.isSaving = false;
  }

  private onSaveError(): void {
    this.statusMessage = 'Save failed. Please retry.';
    this.isSaving = false;
  }
}
