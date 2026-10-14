import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { type AgentInstallation } from '../core/models/agent.models';
import { AGENT_ICONS } from '../core/models/workspace.models';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LaunchDialogShellComponent } from './launch-dialog-shell';

export interface PiLaunchDialogValue {
  name: string;
  model?: string;
  continueLast?: boolean;
}

@Component({
  selector: 'app-pi-launch-dialog',
  imports: [FormsModule, LaunchDialogShellComponent, TranslatePipe],
  template: `
    <app-launch-dialog-shell
      [icon]="agentIcon"
      [heading]="'launch.newPi' | t"
      [detecting]="'launch.detectingPi' | t"
      [installation]="installation()"
      [workingDirectory]="workingDirectory()"
      [canLaunch]="canLaunch()"
      [launching]="launching()"
      [blockedReason]="blockedReason()"
      (launched)="submit()"
      (cancelled)="cancelled.emit()"
      (installRequested)="installRequested.emit()"
      (directoryChangeRequested)="directoryChangeRequested.emit()"
    >
      <div class="form-grid">
        <label class="wide session-name-field">
          <span>{{ 'launch.sessionName' | t }}</span>
          <input
            type="text"
            class="input input-bordered input-sm"
            autofocus
            [placeholder]="'launch.piNameExample' | t"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
          />
        </label>
        <label class="wide model-field">
          <span>{{ 'launch.piModel' | t }}</span>
          <input
            type="text"
            class="input input-bordered input-sm"
            [placeholder]="'launch.piModelPlaceholder' | t"
            [ngModel]="model()"
            (ngModelChange)="model.set($event)"
          />
          <small>{{ 'launch.piModelHelp' | t }}</small>
        </label>
        <label class="wide checkbox-control">
          <input
            type="checkbox"
            [ngModel]="continueLast()"
            (ngModelChange)="continueLast.set($event)"
          />
          <span
            ><strong>{{ 'launch.piContinue' | t }}</strong></span
          >
        </label>
      </div>
    </app-launch-dialog-shell>
  `,
  styleUrls: ['./agent-dialog.scss', './launch-dialog.scss'],
})
export class PiLaunchDialogComponent {
  readonly installRequested = output<void>();
  readonly directoryChangeRequested = output<void>();
  readonly installation = input<AgentInstallation | null>(null);
  readonly workingDirectory = input('');
  readonly launching = input(false);
  readonly launched = output<PiLaunchDialogValue>();
  readonly cancelled = output<void>();

  protected readonly agentIcon = AGENT_ICONS.pi;
  protected readonly name = signal('');
  protected readonly model = signal('');
  protected readonly continueLast = signal(false);
  protected readonly canLaunch = computed(() => Boolean(this.installation()?.healthy));
  private readonly i18n = inject(I18nService);
  protected readonly blockedReason = computed(() =>
    this.canLaunch() ? '' : (this.installation()?.diagnostic ?? this.i18n.t('launch.detectingPi')),
  );

  protected submit(): void {
    if (!this.canLaunch()) return;
    this.launched.emit({
      name: this.name().trim(),
      model: this.model().trim() || undefined,
      continueLast: this.continueLast(),
    });
  }
}
