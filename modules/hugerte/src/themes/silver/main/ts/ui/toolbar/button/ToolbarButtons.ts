import {
  AddEventsBehaviour, AlloyComponent, AlloyEvents, AlloySpec, AlloyTriggers, Behaviour, Button as AlloyButton, Disabling, Dropdown as AlloyDropdown, FloatingToolbarButton,
  GuiFactory, Highlighting,
  Keying, Memento, NativeEvents, Replacing, SketchSpec, SystemEvents, TieredData, TieredMenuTypes, Toggling,
  Tooltipping,
  Unselecting
} from '@ephox/alloy';
import { Toolbar } from '@ephox/bridge';
import { Arr, Cell, Fun, Future, Id, Merger, Optional, Type } from '@ephox/katamari';
import { Attribute, Class, EventArgs, SelectorFind, Traverse } from '@ephox/sugar';

import { ToolbarGroupOption } from '../../../api/Options';
import { UiFactoryBackstage, UiFactoryBackstageProviders, UiFactoryBackstageShared } from '../../../backstage/Backstage';
import * as ReadOnly from '../../../ReadOnly';
import * as ConvertShortcut from '../../../ui/alien/ConvertShortcut';
import { DisablingConfigs } from '../../alien/DisablingConfigs';
import { detectSize } from '../../alien/FlatgridAutodetect';
import { SimpleBehaviours } from '../../alien/SimpleBehaviours';
import * as UiUtils from '../../alien/UiUtils';
import { renderLabel, renderReplaceableIconFromPack } from '../../button/ButtonSlices';
import { onControlAttached, onControlDetached, OnDestroy } from '../../controls/Controls';
import { updateMenuIcon, UpdateMenuIconEvent, updateMenuText, UpdateMenuTextEvent } from '../../dropdown/CommonDropdown';
import * as Icons from '../../icons/Icons';
import { componentRenderPipeline } from '../../menus/item/build/CommonMenuItem';
import { classForPreset } from '../../menus/item/ItemClasses';
import ItemResponse from '../../menus/item/ItemResponse';
import { createPartialChoiceMenu } from '../../menus/menu/MenuChoice';
import { deriveMenuMovement } from '../../menus/menu/MenuMovement';
import * as MenuParts from '../../menus/menu/MenuParts';
import { createTieredDataFrom } from '../../menus/menu/SingleMenu';
import { SingleMenuItemSpec } from '../../menus/menu/SingleMenuTypes';
import { renderToolbarGroup, ToolbarGroup } from '../CommonToolbar';
import { ToolbarButtonClasses } from './ButtonClasses';
import { commonButtonDisplayEvent, onToolbarButtonExecute, toolbarButtonEventOrder } from './ButtonEvents';

type Behaviours = Behaviour.NamedConfiguredBehaviour<any, any, any>[];
type AlloyButtonSpec = Parameters<typeof AlloyButton['sketch']>[0];

interface Specialisation<T> {
  readonly toolbarButtonBehaviours: Behaviours;
  readonly getApi: (comp: AlloyComponent) => T;
  readonly onSetup: (api: T) => OnDestroy<T>;
  readonly tooltipString: Cell<string>;
  readonly tooltipDirty: Cell<boolean>;
}

interface GeneralToolbarButton<T> {
  readonly icon: Optional<string>;
  readonly text: Optional<string>;
  readonly tooltip: Optional<string>;
  readonly shortcut: Optional<string>;
  readonly onAction: (api: T) => void;
  readonly enabled: boolean;
}

interface ChoiceFetcher {
  readonly fetch: (callback: (value: SingleMenuItemSpec[]) => void) => void;
  readonly columns: 'auto' | number;
  readonly presets: Toolbar.PresetTypes;
  readonly onItemAction: (api: Toolbar.ToolbarSplitButtonInstanceApi, value: string) => void;
  readonly select: Optional<(value: string) => boolean>;
}

const getButtonApi = (component: AlloyComponent, tooltipString: Cell<string>, tooltipDirty: Cell<boolean>, providersBackstage: UiFactoryBackstageProviders): Toolbar.ToolbarButtonInstanceApi => ({
  isEnabled: () => !Disabling.isDisabled(component),
  setEnabled: (state: boolean) => Disabling.set(component, !state),
  setText: (text: string) => AlloyTriggers.emitWith(component, updateMenuText, {
    text
  }),
  setIcon: (icon: string) => AlloyTriggers.emitWith(component, updateMenuIcon, {
    icon
  }),
  setTooltip: (tooltip: string) => {
    // Mirror the split button behaviour: translate the tooltip, update the aria-label
    // and store the (untranslated) tooltip so the hover tooltip can be updated on show.
    // The dirty flag is set so the hover tooltip is rebuilt on the next show. This is
    // important even when the new tooltip text equals the initial one, because the
    // initial tooltip text rendered by the config may include a shortcut suffix (e.g.
    // 'Bold (Ctrl+B)') while the cell holds the raw tooltip ('Bold'); a raw string
    // comparison would miss that a `setTooltip` call has taken place.
    const translatedTooltip = providersBackstage.translate(tooltip);
    Attribute.set(component.element, 'aria-label', translatedTooltip);
    tooltipString.set(tooltip);
    tooltipDirty.set(true);
  }
});

const getToggleApi = (component: AlloyComponent, tooltipString: Cell<string>, tooltipDirty: Cell<boolean>, providersBackstage: UiFactoryBackstageProviders): Toolbar.ToolbarToggleButtonInstanceApi => ({
  setActive: (state) => {
    Toggling.set(component, state);
  },
  isActive: () => Toggling.isOn(component),
  isEnabled: () => !Disabling.isDisabled(component),
  setEnabled: (state: boolean) => Disabling.set(component, !state),
  setText: (text: string) => AlloyTriggers.emitWith(component, updateMenuText, {
    text
  }),
  setIcon: (icon: string) => AlloyTriggers.emitWith(component, updateMenuIcon, {
    icon
  }),
  setTooltip: (tooltip: string) => {
    const translatedTooltip = providersBackstage.translate(tooltip);
    Attribute.set(component.element, 'aria-label', translatedTooltip);
    tooltipString.set(tooltip);
    tooltipDirty.set(true);
  }
});

const getTooltipAttributes = (tooltip: Optional<string>, providersBackstage: UiFactoryBackstageProviders) => tooltip.map<{}>((tooltip) => ({
  'aria-label': providersBackstage.translate(tooltip),
})).getOr({});

const renderCommonStructure = (
  optIcon: Optional<string>,
  optText: Optional<string>,
  tooltip: Optional<string>,
  behaviours: Optional<Behaviours>,
  providersBackstage: UiFactoryBackstageProviders,
  btnName?: string
): AlloyButtonSpec => {
  const optMemDisplayText = optText.map(
    (text) => Memento.record(renderLabel(text, ToolbarButtonClasses.Button, providersBackstage))
  );
  const optMemDisplayIcon = optIcon.map(
    (icon) => Memento.record(renderReplaceableIconFromPack(icon, providersBackstage.icons))
  );
  return {
    dom: {
      tag: 'button',
      classes: [ ToolbarButtonClasses.Button ].concat(optText.isSome() ? [ ToolbarButtonClasses.MatchWidth ] : []),
      attributes: {
        ...getTooltipAttributes(tooltip, providersBackstage),
        ...(Type.isNonNullable(btnName) ? { 'data-mce-name': btnName } : {})
      }
    },
    components: componentRenderPipeline([
      optMemDisplayIcon.map((mem) => mem.asSpec()),
      optMemDisplayText.map((mem) => mem.asSpec()),
    ]),

    eventOrder: {
      [NativeEvents.mousedown()]: [
        'focusing',
        'alloy.base.behaviour',
        commonButtonDisplayEvent
      ],
      [SystemEvents.attachedToDom()]: [ commonButtonDisplayEvent, 'toolbar-group-button-events' ]
    },

    buttonBehaviours: Behaviour.derive(
      [
        DisablingConfigs.toolbarButton(providersBackstage.isDisabled),
        ReadOnly.receivingConfig(),
        AddEventsBehaviour.config(commonButtonDisplayEvent, [
          AlloyEvents.runOnAttached((comp, _se) => UiUtils.forceInitialSize(comp)),
          AlloyEvents.run<UpdateMenuTextEvent>(updateMenuText, (comp, se) => {
            optMemDisplayText.bind((mem) => mem.getOpt(comp)).each((displayText) => {
              Replacing.set(displayText, [ GuiFactory.text(providersBackstage.translate(se.event.text)) ]);
            });
          }),
          AlloyEvents.run<UpdateMenuIconEvent>(updateMenuIcon, (comp, se) => {
            optMemDisplayIcon.bind((mem) => mem.getOpt(comp)).each((displayIcon) => {
              Replacing.set(displayIcon, [ renderReplaceableIconFromPack(se.event.icon, providersBackstage.icons) ]);
            });
          }),
          AlloyEvents.run<EventArgs<MouseEvent>>(NativeEvents.mousedown(), (_button, se) => {
            se.event.prevent();
          })
        ])
      ].concat(behaviours.getOr([ ]))
    )
  };
};

const renderFloatingToolbarButton = (spec: Toolbar.GroupToolbarButton, backstage: UiFactoryBackstage, identifyButtons: (toolbar: string | ToolbarGroupOption[]) => ToolbarGroup[], attributes: Record<string, string>, btnName?: string): SketchSpec => {
  const sharedBackstage = backstage.shared;
  const editorOffCell = Cell(Fun.noop);
  const tooltipString = Cell<string>(spec.tooltip.getOr(''));
  const tooltipDirty = Cell(false);
  const specialisation = {
    toolbarButtonBehaviours: [],
    getApi: (comp: AlloyComponent) => getButtonApi(comp, tooltipString, tooltipDirty, sharedBackstage.providers),
    onSetup: spec.onSetup,
    tooltipString,
    tooltipDirty
  };
  const behaviours: Behaviours = [
    AddEventsBehaviour.config('toolbar-group-button-events', [
      onControlAttached(specialisation, editorOffCell),
      onControlDetached(specialisation, editorOffCell)
    ])
  ];

  return FloatingToolbarButton.sketch({
    lazySink: sharedBackstage.getSink,
    fetch: () => Future.nu((resolve) => {
      resolve(Arr.map(identifyButtons(spec.items), renderToolbarGroup));
    }),
    markers: {
      toggledClass: ToolbarButtonClasses.Ticked
    },
    parts: {
      button: renderCommonStructure(spec.icon, spec.text, spec.tooltip, Optional.some(behaviours), sharedBackstage.providers, btnName),
      toolbar: {
        dom: {
          tag: 'div',
          classes: [ 'tox-toolbar__overflow' ],
          attributes
        }
      }
    }
  });
};

const renderCommonToolbarButton = <T>(spec: GeneralToolbarButton<T>, specialisation: Specialisation<T>, providersBackstage: UiFactoryBackstageProviders, btnName?: string): SketchSpec => {
  const editorOffCell = Cell(Fun.noop);
  const structure = renderCommonStructure(spec.icon, spec.text, spec.tooltip, Optional.none(), providersBackstage, btnName);
  return AlloyButton.sketch({
    dom: structure.dom,
    components: structure.components,

    eventOrder: toolbarButtonEventOrder,
    buttonBehaviours: {
      ...Behaviour.derive(
        [
          AddEventsBehaviour.config('toolbar-button-events', [
            onToolbarButtonExecute<T>({
              onAction: spec.onAction,
              getApi: specialisation.getApi
            }),
            onControlAttached(specialisation, editorOffCell),
            onControlDetached(specialisation, editorOffCell)
          ]),
          ...(spec.tooltip.map(
            (t) => Tooltipping.config(
              providersBackstage.tooltips.getConfig({
                // Note: The shortcut suffix is only included in the initial tooltip text. Once
                // `setTooltip` is called, the tooltip is shown without the shortcut suffix, which
                // keeps parity with split buttons (which don't render shortcut suffixes).
                tooltipText: providersBackstage.translate(t) + spec.shortcut.map((shortcut) => ` (${ConvertShortcut.convertText(shortcut)})`).getOr(''),
                onShow: (comp) => {
                  // If the tooltip has been updated via the `setTooltip` button API, rebuild the
                  // hover tooltip with the new tooltip text (mirroring the split button behaviour).
                  // A dirty flag is used rather than a string comparison: the initial tooltip text
                  // includes a shortcut suffix (e.g. 'Bold (Ctrl+B)') while the cell holds the raw
                  // tooltip ('Bold'), so calling setTooltip('Bold') would be missed by a string
                  // comparison. The dirty flag is intentionally never reset - the popup is rebuilt
                  // from the static config on every show, so each show must re-apply the update.
                  if (specialisation.tooltipDirty.get()) {
                    const translatedTooltip = providersBackstage.translate(specialisation.tooltipString.get());
                    Tooltipping.setComponents(comp,
                      providersBackstage.tooltips.getComponents({ tooltipText: translatedTooltip })
                    );
                  }
                }
              })
            )
          )).toArray(),
          // Enable toolbar buttons by default
          DisablingConfigs.toolbarButton(() => !spec.enabled || providersBackstage.isDisabled()),
          ReadOnly.receivingConfig()
        ].concat(specialisation.toolbarButtonBehaviours)
      ),
      // Here we add the commonButtonDisplayEvent behaviour from the structure so we can listen
      // to updateMenuIcon and updateMenuText events and run the defined callbacks as they are
      // defined in the renderCommonStructure function and fix the size of the button onAttached.
      [commonButtonDisplayEvent]: structure.buttonBehaviours?.[commonButtonDisplayEvent],
    }
  });
};

const renderToolbarButton = (spec: Toolbar.ToolbarButton, providersBackstage: UiFactoryBackstageProviders, btnName?: string): SketchSpec =>
  renderToolbarButtonWith(spec, providersBackstage, [ ], btnName);

const renderToolbarButtonWith = (spec: Toolbar.ToolbarButton, providersBackstage: UiFactoryBackstageProviders, bonusEvents: AlloyEvents.AlloyEventKeyAndHandler<any>[], btnName?: string): SketchSpec => {
  const tooltipString = Cell<string>(spec.tooltip.getOr(''));
  const tooltipDirty = Cell(false);
  return renderCommonToolbarButton(spec, {
    toolbarButtonBehaviours: (bonusEvents.length > 0 ? [
      // TODO: May have to pass through eventOrder if events start clashing
      AddEventsBehaviour.config('toolbarButtonWith', bonusEvents)
    ] : [ ]),
    getApi: (comp: AlloyComponent) => getButtonApi(comp, tooltipString, tooltipDirty, providersBackstage),
    onSetup: spec.onSetup,
    tooltipString,
    tooltipDirty
  }, providersBackstage, btnName);
};

const renderToolbarToggleButton = (spec: Toolbar.ToolbarToggleButton, providersBackstage: UiFactoryBackstageProviders, btnName?: string): SketchSpec =>
  renderToolbarToggleButtonWith(spec, providersBackstage, [ ], btnName);

const renderToolbarToggleButtonWith = (spec: Toolbar.ToolbarToggleButton, providersBackstage: UiFactoryBackstageProviders, bonusEvents: AlloyEvents.AlloyEventKeyAndHandler<any>[], btnName?: string): SketchSpec => {
  const tooltipString = Cell<string>(spec.tooltip.getOr(''));
  const tooltipDirty = Cell(false);
  return renderCommonToolbarButton(spec,
    {
      toolbarButtonBehaviours: [
        Replacing.config({ }),
        Toggling.config({ toggleClass: ToolbarButtonClasses.Ticked, aria: { mode: 'pressed' }, toggleOnExecute: false })
      ].concat(bonusEvents.length > 0 ? [
        // TODO: May have to pass through eventOrder if events start clashing
        AddEventsBehaviour.config('toolbarToggleButtonWith', bonusEvents)
      ] : [ ]),
      getApi: (comp: AlloyComponent) => getToggleApi(comp, tooltipString, tooltipDirty, providersBackstage),
      onSetup: spec.onSetup,
      tooltipString,
      tooltipDirty
    },
    providersBackstage,
    btnName
  );
};

const fetchChoices = (getApi: (comp: AlloyComponent) => Toolbar.ToolbarSplitButtonInstanceApi, spec: ChoiceFetcher, providersBackstage: UiFactoryBackstageProviders) =>
  (comp: AlloyComponent): Future<Optional<TieredData>> =>
    Future.nu<SingleMenuItemSpec[]>((callback) => spec.fetch(callback))
      .map((items) => Optional.from(createTieredDataFrom(
        Merger.deepMerge(
          createPartialChoiceMenu(
            Id.generate('menu-value'),
            items,
            (value) => {
              spec.onItemAction(getApi(comp), value);
            },
            spec.columns,
            spec.presets,
            ItemResponse.CLOSE_ON_EXECUTE,
            spec.select.getOr(Fun.never),
            providersBackstage
          ),
          {
            movement: deriveMenuMovement(spec.columns, spec.presets),
            menuBehaviours: SimpleBehaviours.unnamedEvents(spec.columns !== 'auto' ? [ ] : [
              AlloyEvents.runOnAttached((comp, _se) => {
                detectSize(comp, 4, classForPreset(spec.presets)).each(({ numRows, numColumns }) => {
                  Keying.setGridSize(comp, numRows, numColumns);
                });
              })
            ])
          } as TieredMenuTypes.PartialMenuSpec
        )
      )));

const makeSplitButtonApi = (
  tooltipString: Cell<string>,
  tooltipDirty: Cell<boolean>,
  sharedBackstage: UiFactoryBackstageShared
) => (component: AlloyComponent): Toolbar.ToolbarSplitButtonInstanceApi => {
  const system = component.getSystem();

  // The main action button and the chevron are siblings nested inside the split button
  // container, so we can locate the other half from whichever component the API is
  // currently operating on.
  const getComponents = () => {
    const isChevron = Class.has(component.element, ToolbarButtonClasses.SplitButtonChevron);
    const mainOpt = isChevron
      ? Traverse.prevSibling(component.element).bind((el) => system.getByDom(el).toOptional())
      : Optional.some(component);
    const chevronOpt = isChevron
      ? Optional.some(component)
      : Traverse.nextSibling(component.element).bind((el) => system.getByDom(el).toOptional());
    return { mainOpt, chevronOpt };
  };

  const applyToBoth = (f: (comp: AlloyComponent) => void) => {
    const { mainOpt, chevronOpt } = getComponents();
    mainOpt.each(f);
    chevronOpt.each(f);
  };

  return {
    isEnabled: () => {
      const { mainOpt } = getComponents();
      return mainOpt.exists((comp) => !Disabling.isDisabled(comp));
    },
    setEnabled: (state: boolean) => applyToBoth((comp) => Disabling.set(comp, !state)),
    setIconFill: (id, value) => {
      applyToBoth((comp) => {
        SelectorFind.descendant(comp.element, `svg path[class="${id}"], rect[class="${id}"]`).each((underlinePath) => {
          Attribute.set(underlinePath, 'fill', value);
        });
      });
    },
    setActive: (state) => {
      const { mainOpt } = getComponents();
      mainOpt.each((comp) => Toggling.set(comp, state));
    },
    isActive: () => {
      const { mainOpt } = getComponents();
      return mainOpt.exists(Toggling.isOn);
    },
    setText: (text: string) => {
      const { mainOpt } = getComponents();
      mainOpt.each((comp) => AlloyTriggers.emitWith(comp, updateMenuText, {
        text
      }));
    },
    setIcon: (icon: string) => {
      const { mainOpt } = getComponents();
      mainOpt.each((comp) => AlloyTriggers.emitWith(comp, updateMenuIcon, {
        icon
      }));
    },
    setTooltip: (tooltip: string) => {
      const translatedTooltip = sharedBackstage.providers.translate(tooltip);
      tooltipString.set(tooltip);
      tooltipDirty.set(true);
      // Keep the non-interactive container's label in sync for backwards compatibility
      SelectorFind.ancestor(component.element, '.' + ToolbarButtonClasses.SplitButton).each((container) => Attribute.set(container, 'aria-label', translatedTooltip));
      const { mainOpt, chevronOpt } = getComponents();
      mainOpt.each((comp) => Attribute.set(comp.element, 'aria-label', translatedTooltip));
      chevronOpt.each((comp) => Attribute.set(comp.element, 'aria-label', sharedBackstage.providers.translate([ '{0} menu', translatedTooltip ])));
    }
  };
};

const renderSplitButton = (spec: Toolbar.ToolbarSplitButton, sharedBackstage: UiFactoryBackstageShared, btnName?: string): AlloySpec => {
  const tooltipString = Cell<string>(spec.tooltip.getOr(''));
  const tooltipDirty = Cell(false);
  const getApi = makeSplitButtonApi(tooltipString, tooltipDirty, sharedBackstage);

  // The main action button is rendered through the common toolbar button pipeline so that
  // it keeps the standard disabling, tooltip, control (onSetup/onDestroy) and
  // update text/icon behaviours. The only extra behaviour is the toggling used to
  // represent the active (pressed) state of the split button.
  const mainButton = renderCommonToolbarButton<Toolbar.ToolbarSplitButtonInstanceApi>({
    icon: spec.icon,
    text: spec.text,
    tooltip: spec.tooltip,
    shortcut: Optional.none(),
    onAction: (api) => spec.onAction(api),
    enabled: true
  }, {
    toolbarButtonBehaviours: [
      Toggling.config({ toggleClass: ToolbarButtonClasses.Ticked, aria: { mode: 'pressed' }, toggleOnExecute: false })
    ],
    getApi,
    onSetup: spec.onSetup,
    tooltipString,
    tooltipDirty
  }, sharedBackstage.providers, btnName);

  // Mark the primary action button so it can be targeted independently of the chevron.
  const mainButtonWithClass: SketchSpec = {
    ...mainButton,
    dom: {
      ...mainButton.dom,
      classes: (mainButton.dom.classes ?? [ ]).concat([ ToolbarButtonClasses.SplitButtonMain ])
    }
  };

  const chevronTooltip = (tooltip: string) => sharedBackstage.providers.translate([ '{0} menu', sharedBackstage.providers.translate(tooltip) ]);

  // The chevron is a real, independently focusable dropdown button. Presenting two
  // separate focusable controls (rather than making the whole split button a single
  // role=button element) is what lets Firefox dispatch the mouse click to the primary
  // button instead of retargeting it to the surrounding container after focus moves.
  const chevron = AlloyDropdown.sketch({
    dom: {
      tag: 'button',
      classes: [ ToolbarButtonClasses.Button, ToolbarButtonClasses.SplitButtonChevron ],
      innerHtml: Icons.get('chevron-down', sharedBackstage.providers.icons),
      attributes: {
        'aria-label': chevronTooltip(spec.tooltip.getOr('')),
        ...(Type.isNonNullable(btnName) ? { 'data-mce-name': btnName + '-chevron' } : {})
      }
    },
    components: [],
    eventOrder: {
      [NativeEvents.mousedown()]: [ 'focusing', 'alloy.base.behaviour', 'split-chevron-events' ]
    },
    toggleClass: ToolbarButtonClasses.Ticked,
    dropdownBehaviours: Behaviour.derive([
      DisablingConfigs.toolbarButton(sharedBackstage.providers.isDisabled),
      ReadOnly.receivingConfig(),
      Icons.addFocusableBehaviour(),
      Unselecting.config({ }),
      // Mirror the primary button (and the rest of the toolbar) by preventing the
      // default mousedown. This keeps the editor selection intact when the menu is
      // opened with the mouse, which the color buttons rely on when they detect the
      // current color.
      AddEventsBehaviour.config('split-chevron-events', [
        AlloyEvents.run<EventArgs<MouseEvent>>(NativeEvents.mousedown(), (_comp, se) => {
          se.event.prevent();
        })
      ]),
      ...(spec.tooltip.map((tooltip) => Tooltipping.config(
        sharedBackstage.providers.tooltips.getConfig({
          tooltipText: sharedBackstage.providers.translate(tooltip),
          onShow: (comp) => {
            if (tooltipString.get() !== tooltip) {
              const translatedTooltip = sharedBackstage.providers.translate(tooltipString.get());
              Tooltipping.setComponents(comp,
                sharedBackstage.providers.tooltips.getComponents({ tooltipText: chevronTooltip(translatedTooltip) })
              );
            }
          }
        })
      )).toArray())
    ]),
    lazySink: sharedBackstage.getSink,
    fetch: fetchChoices(getApi, spec, sharedBackstage.providers),
    // Highlight the currently selected menu item (rather than the first item) when the
    // menu opens. This matches the previous split-dropdown behaviour and is relied upon
    // by the color buttons to mark the current color.
    onOpen: (_anchor, _comp, menu) => {
      Highlighting.highlightBy(menu, (item) => Attribute.get(item.element, 'aria-checked') === 'true');
      Highlighting.getHighlighted(menu).each(Keying.focusIn);
    },
    parts: {
      // FIX: hasIcons
      menu: MenuParts.part(false, spec.columns, spec.presets)
    }
  });

  // The container is only used to keep the split button styling (flex layout, shared
  // rounded corners and margins). It is deliberately not focusable and has no click
  // handling so the two buttons inside it remain independent controls.
  return {
    dom: {
      tag: 'div',
      classes: [ ToolbarButtonClasses.SplitButton ],
      attributes: {
        ...getTooltipAttributes(spec.tooltip, sharedBackstage.providers),
        ...(Type.isNonNullable(btnName) ? { 'data-mce-name': btnName } : {})
      }
    },
    components: [ mainButtonWithClass, chevron ]
  };
};

export {
  renderCommonStructure,
  renderFloatingToolbarButton,
  renderToolbarButton,
  renderToolbarButtonWith,
  renderToolbarToggleButton,
  renderToolbarToggleButtonWith,
  renderSplitButton
};
