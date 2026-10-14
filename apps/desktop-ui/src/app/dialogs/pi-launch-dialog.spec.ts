import { ComponentFixture, TestBed } from '@angular/core/testing';

import { type AgentInstallation } from '../core/models/agent.models';
import { PiLaunchDialogComponent, type PiLaunchDialogValue } from './pi-launch-dialog';

const INSTALLATION: AgentInstallation = {
  agentType: 'pi',
  installed: true,
  executablePath: 'pi',
  version: '1.2.3',
  healthy: true,
  diagnostic: 'Pi 可用',
};

describe('PiLaunchDialogComponent', () => {
  let fixture: ComponentFixture<PiLaunchDialogComponent>;
  let root: HTMLElement;

  function launchValue(): PiLaunchDialogValue | undefined {
    let value: PiLaunchDialogValue | undefined;
    fixture.componentInstance.launched.subscribe((event) => (value = event));
    root.querySelector<HTMLButtonElement>('footer .primary')!.click();
    return value;
  }

  function setText(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PiLaunchDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PiLaunchDialogComponent);
    fixture.componentRef.setInput('installation', INSTALLATION);
    fixture.componentRef.setInput('workingDirectory', 'D:/devlop/Termexo');
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  it('will not launch while Pi is not detected', () => {
    fixture.componentRef.setInput('installation', { ...INSTALLATION, healthy: false });
    fixture.detectChanges();

    expect(launchValue()).toBeUndefined();
  });

  it('leaves the model unset so Pi falls back to its own configuration', () => {
    const value = launchValue();

    expect(value?.model).toBeUndefined();
    expect(root.querySelector('.auto-confirm-control')).toBeNull();
  });

  it('carries the model and continue option to the caller', () => {
    const inputs = root.querySelectorAll<HTMLInputElement>('.form-grid input[type="text"]');
    setText(inputs[1], ' anthropic/sonnet ');
    const continueLast = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    continueLast.checked = true;
    continueLast.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(launchValue()).toEqual({ name: '', model: 'anthropic/sonnet', continueLast: true });
  });

  it('trims a padded session name rather than passing the spaces through', () => {
    const inputs = root.querySelectorAll<HTMLInputElement>('.form-grid input[type="text"]');
    setText(inputs[0], '  Pi 适配  ');

    expect(launchValue()?.name).toBe('Pi 适配');
  });
});
