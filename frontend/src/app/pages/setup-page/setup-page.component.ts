import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SetupService } from '../../services/auth/setup.service';
import { AuthService } from '../../services/auth/auth.service';

@Component({
  selector: 'app-setup-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './setup-page.component.html',
  styleUrls: ['./setup-page.component.scss'],
})
export class SetupPageComponent {
  private readonly setupService = inject(SetupService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    email: new FormControl('', { nonNullable: true }),
  });

  apiKey: string | null = null;
  step: 'form' | 'done' = 'form';
  error: string | null = null;
  loading = false;
  submitted = false;

  submit(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.error = null;
    this.loading = true;

    const payload = this.form.getRawValue();
    this.setupService.runSetup(payload).subscribe({
      next: (resp) => {
        if (!resp?.api_key) {
          this.error = 'Setup completed, but API key was not returned.';
          return;
        }
        this.apiKey = resp.api_key;
        this.step = 'done';
        this.form.disable();
        localStorage.setItem('auth.access', resp.access);
        localStorage.setItem('auth.refresh', resp.refresh);
        this.loading = false;
      },
      error: () => {
        this.error = 'Setup failed. Please try again.';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  copyApiKey(): void {
    if (!this.apiKey) return;
    navigator.clipboard.writeText(this.apiKey);
  }

  continue(): void {
    this.router.navigateByUrl('/projects');
  }
}
