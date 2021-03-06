import { AfterViewInit, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, Injector } from '@angular/core';
import { ControlContainer, FormControl } from '@angular/forms';
import { ApiHelper } from 'app/shared/api-helper';
import { BaseFormFieldComponent } from 'app/shared/base-form-field.component';
import { blank, empty } from 'app/shared/helper';
import { BsDropdownDirective } from 'ngx-bootstrap/dropdown';
import { BehaviorSubject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';

/**
 * Base class for fields that present a text field and searches for keywords.
 * @param T The field data type
 * @param A The autocomplete results data type
 */
export abstract class BaseAutocompleteFieldComponent<T, A>
  extends BaseFormFieldComponent<T> implements OnInit, OnDestroy, AfterViewInit {
  inputFieldControl: FormControl;
  @ViewChild('inputField') inputField: ElementRef;
  @ViewChild('dropdown') dropdown: BsDropdownDirective;
  @ViewChild('dropDownMenu') menuRef: ElementRef;

  @Input() autoSearch = true;

  @Output() selected = new EventEmitter<A>();
  selection$ = new BehaviorSubject<A>(null);
  get selection(): A {
    return this.selection$.value;
  }
  set selection(value: A) {
    this.selection$.next(value);
  }
  options$ = new BehaviorSubject<A[]>(null);

  allowOptions = true;

  private bodyListener: any;

  constructor(
    injector: Injector,
    protected controlContainer: ControlContainer) {
    super(injector, controlContainer);
    this.inputFieldControl = new FormControl(null);
  }

  ngOnInit() {
    super.ngOnInit();
    this.addSub(this.inputFieldControl.valueChanges.pipe(
      filter(text => blank(text))
    ).subscribe(() => {
      this.close();
    }));
    if (this.autoSearch && this.allowOptions) {
      this.addSub(this.inputFieldControl.valueChanges.pipe(
        filter(text => !blank(text)),
        debounceTime(ApiHelper.DEBOUNCE_TIME),
        distinctUntilChanged(),
        switchMap(text => this.query(text))
      ).subscribe(rows => {
        if (!this.allowOptions || blank(this.inputFieldControl.value)) {
          this.options$.next([]);
        } else {
          this.options$.next(rows);
          if (!empty(rows)) {
            this.open();
          }
        }
      }));
    }
    this.addSub(this.formControl.statusChanges.subscribe(status => {
      // We should delegate the error to the input field control, so it is correctly marked as error
      if (status === 'INVALID') {
        this.inputFieldControl.setErrors(this.formControl.errors);
      } else if (status === 'VALID') {
        this.inputFieldControl.setErrors(null);
      }
    }));
    this.bodyListener = () => this.close();
  }

  search(text?: string) {
    if (!this.allowOptions) {
      return;
    }
    if (blank(text)) {
      text = this.inputFieldControl.value;
    }
    if (blank(text)) {
      this.options$.next([]);
      this.close();
    } else {
      this.addSub(this.query(text).subscribe(rows => {
        if (this.allowOptions) {
          this.options$.next(rows);
          if (!empty(rows)) {
            this.open();
          }
        }
      }));
    }
  }

  ngAfterViewInit() {
    this.dropdown.onShown.subscribe(() => {
      document.body.addEventListener('click', this.bodyListener, false);
    });
    this.dropdown.onHidden.subscribe(() => {
      document.body.removeEventListener('click', this.bodyListener, false);
    });
  }

  onValueInitialized() {
    if (!empty(this.value)) {
      this.fetch(this.value).subscribe(res => {
        this.select(res, this.value);
      });
    }
  }

  /**
   * Must be implemented in order to fetch the autocomplete data from the given initial value
   * @param value The initial value
   */
  protected abstract fetch(value: T): Observable<A>;

  /**
   * Must be implemented in order to fetch the autocomplete results matching the given text
   * @param text The query text
   */
  protected abstract query(text: string): Observable<A[]>;

  /**
   * Must be implemented to return a display text for the given autocomplete result
   */
  abstract toDisplay(value: A): string;

  /**
   * Must be implemented to return the internal value for the given autocomplete result
   */
  abstract toValue(value: A): T;

  protected getFocusableControl() {
    return this.inputField;
  }

  onShown() {
    const input = this.inputField.nativeElement as HTMLInputElement;
    const rect = input.getBoundingClientRect();
    const docHeight = (window.innerHeight || document.documentElement.clientHeight);
    this.dropdown.dropup = rect.bottom > docHeight - 100;
    // Workaround: ngx-bootstrap sets top sometimes when we set dropup, which causes a position error
    setTimeout(() => this.menuRef.nativeElement.style.top = '', 1);
    this.addShortcut(['ArrowUp', 'ArrowDown', 'Enter', 'Escape'], event => this.handleShortcut(event));
  }

  onHidden() {
    this.clearShortcuts();
  }

  onDisabledChange(isDisabled: boolean): void {
    const input = this.inputField.nativeElement as HTMLInputElement;
    input.disabled = isDisabled;
  }

  /**
   * Selects the given autocomplete value, emitting the event
   * @param selected The selected value
   * @param value The internal value to be set
   */
  select(selected: A, value?: T) {
    const newValue = value || (selected == null ? null : this.toValue(selected));
    if (this.value !== newValue) {
      this.value = newValue;
    }
    this.selection = selected;
    this.selected.emit(selected);
    this.close();
    if (this.inputFieldControl.value !== newValue) {
      this.inputFieldControl.setValue(newValue);
    }
  }

  protected getDisabledValue(): string {
    return this.selection ? this.toDisplay(this.selection) : String(this.value || '');
  }

  close() {
    if (this.dropdown) {
      this.dropdown.hide();
    }
    this.options$.next(null);
  }

  open() {
    this.dropdown.show();
  }

  ngClassFor(option: A, index: number): any {
    const result = {
      'mt-1': index > 0,
      selected: this.value === this.toValue(option)
    };
    result[`autocomplete-option-${index}`] = true;
    return result;
  }

  protected onEscapePressed() {
    this.select(null);
  }

  private handleShortcut(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.onEscapePressed();
      return;
    }
    const element = this.menuRef.nativeElement as HTMLElement;
    const active = document.activeElement as HTMLElement;
    let index = -1;
    active.classList.forEach(c => {
      const match = c.match(/autocomplete\-option\-(\d+)/);
      if (match) {
        index = Number.parseInt(match[1], 10);
      }
    });

    const options = this.options$.value;
    switch (event.key) {
      case 'ArrowUp':
        index--;
        break;
      case 'ArrowDown':
        index++;
        break;
      case 'Enter':
        if (index >= 0) {
          this.select(options[index]);
        }
        return;
    }

    index = Math.min(Math.max(0, index), options.length - 1);
    const toFocus = element.getElementsByClassName(`autocomplete-option-${index}`);
    if (toFocus.length > 0) {
      const focusEl = toFocus.item(0) as HTMLElement;
      focusEl.focus();
    }
  }
}
