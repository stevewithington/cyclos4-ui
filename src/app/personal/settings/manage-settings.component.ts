import { ChangeDetectionStrategy, Component, Injector, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { BasePageComponent } from 'app/shared/base-page.component';

/**
 * Manages the user settings
 */
@Component({
  selector: 'manage-settings',
  templateUrl: 'manage-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageSettingsComponent
  extends BasePageComponent<any>
  implements OnInit {

  darkThemeControl: FormControl;

  constructor(
    injector: Injector) {
    super(injector);
  }

  ngOnInit() {
    super.ngOnInit();
    this.darkThemeControl = new FormControl(this.layout.darkTheme);
    this.addSub(this.darkThemeControl.valueChanges.subscribe(value => {
      this.layout.darkTheme = value;
    }));
    this.data = true;
  }
}
