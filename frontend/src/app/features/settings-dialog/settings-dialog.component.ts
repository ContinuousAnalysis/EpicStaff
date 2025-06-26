import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogRef } from '@angular/cdk/dialog';
import { IconButtonComponent } from '../../shared/components/buttons/icon-button/icon-button.component';
import { LlmModelsTabComponent } from './components/llm-models-tab/llm-models-tab.component';
import { EmbeddingModelsTabComponent } from './components/embedding-models-tab/embedding-models-tab.component';
import { VoiceModelsTabComponent } from './components/voice-models-tab/voice-models-tab.component';
import { PreferencesTabComponent } from './components/preferences-tab/preferences-tab.component';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { QuickstartTabComponent } from './components/quickstart-tab/quickstart-tab.component';

export interface Tab {
  id: string;
  label: string;
}

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    IconButtonComponent,
    LlmModelsTabComponent,
    EmbeddingModelsTabComponent,
    VoiceModelsTabComponent,
    PreferencesTabComponent,
    AppIconComponent,
    QuickstartTabComponent,
  ],
  template: `
    <div class="settings-dialog">
      <header>
        <div class="header-title">
          <app-icon icon="ui/settings-filled" size="20"></app-icon>
          <h2>Settings</h2>
        </div>
        <app-icon-button
          icon="ui/x"
          ariaLabel="Close settings"
          (click)="close()"
        ></app-icon-button>
      </header>

      <div class="dialog-content">
        <div class="sidebar">
          <div class="tabs-container">
            @for (tab of tabs; track tab.id) {
            <button
              class="tab-button"
              [class.active]="activeTabId === tab.id"
              (click)="selectTab(tab.id)"
            >
              {{ tab.label }}
            </button>
            }
          </div>
        </div>

        <div class="tab-content">
          @switch (activeTabId) { @case ('llm') {
          <app-llm-models-tab></app-llm-models-tab>
          } @case ('embedding') {
          <app-embedding-models-tab></app-embedding-models-tab>
          } @case ('voice') {
          <app-voice-models-tab></app-voice-models-tab>
          } @case ('preferences') {
          <app-preferences-tab></app-preferences-tab>
          } @case ('quickstart') {
          <app-quickstart-tab></app-quickstart-tab>
          } }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .settings-dialog {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
        background-color: var(--color-modals-background);
        border-radius: 8px;
        color: var(--color-text-primary);

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--color-divider-regular);

          .header-title {
            display: flex;
            align-items: center;
            gap: 8px;

            h2 {
              margin: 0;
              font-size: 20px;
              font-weight: 500;
            }
          }
        }

        .dialog-content {
          display: flex;
          flex: 1;
          overflow: hidden;

          .sidebar {
            width: 240px;
            border-right: 1px solid var(--color-divider-regular);
            padding: 1.25rem;

            .tabs-container {
              display: flex;
              flex-direction: column;
              gap: 12px;

              .tab-button {
                background: transparent;
                border: none;
                border-radius: 8px;
                color: var(--color-text-primary);
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                padding: 12px 16px;
                text-align: left;
                transition: all 0.2s ease;
                width: 100%;

                &:hover {
                  background-color: rgba(255, 255, 255, 0.05);
                }

                &.active {
                  background-color: rgba(104, 95, 255, 0.1);
                  color: var(--accent-color);
                }
              }
            }
          }

          .tab-content {
            flex: 1;

            overflow-y: auto;
          }
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialogComponent {
  public tabs: Tab[] = [
    { id: 'llm', label: 'LLM Models' },
    { id: 'embedding', label: 'Embedding Models' },
    { id: 'voice', label: 'Voice Models' },
    // { id: 'preferences', label: 'Preferences' },
    { id: 'quickstart', label: 'Quickstart' },
  ];

  public activeTabId: string = 'llm';

  public constructor(private readonly dialogRef: DialogRef<void>) {}

  public selectTab(tabId: string): void {
    this.activeTabId = tabId;
  }

  public close(): void {
    this.dialogRef.close();
  }
}
