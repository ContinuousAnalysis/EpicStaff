import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { LLM_Providers_Service } from '../../../settings-dialog/services/LLM_providers.service';
import {
  LLM_Provider,
  ModelTypes,
} from '../../../settings-dialog/models/LLM_provider.model';
import { getProviderIconPath } from '../../../settings-dialog/utils/get-provider-icon';
import { catchError, take, tap } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-quickstart-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AppIconComponent],
  templateUrl: './quickstart-section.component.html',
  styleUrls: ['./quickstart-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickstartSectionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly providersService = inject(LLM_Providers_Service);

  public readonly quickStartForm = this.fb.group({
    apiKey: [''],
  });

  public readonly showApiKey = signal(false);
  public readonly isSaving = signal(false);
  public readonly isProvidersOpen = signal(false);

  public readonly providers = signal<LLM_Provider[]>([]);
  public readonly selectedProvider = signal<LLM_Provider | null>(null);

  public ngOnInit(): void {
    this.loadProviders();
  }

  public toggleApiKeyVisibility(): void {
    this.showApiKey.set(!this.showApiKey());
  }

  public toggleProviders(): void {
    const nextState = !this.isProvidersOpen();
    this.isProvidersOpen.set(nextState);

    if (nextState && this.providers().length === 0) {
      this.loadProviders();
    }
  }

  public selectProvider(provider: LLM_Provider): void {
    this.selectedProvider.set(provider);
    this.isProvidersOpen.set(false);
  }

  public onQuickStart(): void {
    const apiKey = this.quickStartForm.get('apiKey')?.value;
    if (!apiKey || !this.selectedProvider()) {
      return;
    }

    this.isSaving.set(true);
    console.log('[Quickstart] activate', {
      apiKey,
      provider: this.selectedProvider(),
    });
    this.isSaving.set(false);
  }

  public onCancel(): void {
    this.quickStartForm.reset({ apiKey: '' });
  }

  public onReset(): void {
    this.quickStartForm.reset({ apiKey: '' });
  }

  public onReviewDefaults(): void {
    console.log('[Quickstart] review default models');
  }

  public getProviderIcon(provider: LLM_Provider | null): string {
    return getProviderIconPath(provider?.name || null);
  }

  public formatProviderName(provider: LLM_Provider | null): string {
    if (!provider?.name) {
      return 'Select provider';
    }

    return provider.name
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private loadProviders(): void {
    this.providersService
      .getProvidersByQuery(ModelTypes.LLM)
      .pipe(
        take(1),
        tap((providers) => {
          console.log('[Quickstart] Loaded providers:', providers);
          this.providers.set(providers);
          if (!this.selectedProvider() && providers.length > 0) {
            this.selectedProvider.set(providers[0]);
            console.log('[Quickstart] Selected default provider:', providers[0]);
          }
        }),
        catchError((error) => {
          console.error('[Quickstart] Error loading providers:', error);
          this.providers.set([]);
          return of([]);
        })
      )
      .subscribe();
  }
}


