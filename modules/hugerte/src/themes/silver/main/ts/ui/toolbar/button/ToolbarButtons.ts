import {
  AddEventsBehaviour, AlloyComponent, AlloyEvents, AlloyTriggers, Behaviour, Button as AlloyButton, Disabling, Dropdown as AlloyDropdown, FloatingToolbarButton, GuiFactory,
  Highlighting, Keying, Memento, NativeEvents, Replacing, AlloySpec, SketchSpec, SystemEvents, TieredData, TieredMenuTypes, Toggling,
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

// The chevron of a split button is a separate control, so it needs a distinct accessible
// name. Mirror TinyMCE 8 by deriving it from the main button's label (e.g. "Text color menu").
const getChevronTooltip = (providersBackstage: UiFactoryBackstageProviders, tooltip: string): string =>
  providersBackstage.translate([ '{0} menu', providersBackstage.translate(tooltip) ]);

const focusButtonEvent = Id.generate('focus-button');

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
          AlloyEvents.run<EventArgs<MouseEvent>>(NativeEvents.mousedown(), (button, se) => {
            se.event.prevent();
            AlloyTriggers.emit(button, focusButtonEvent);
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

// TODO: hookup onSetup and onDestroy
const makeSplitButtonApi = (tooltipString: Cell<string>, sharedBackstage: UiFactoryBackstageShared) =>
  (component: AlloyComponent): Toolbar.ToolbarSplitButtonInstanceApi => {
    const system = component.getSystem();
    const element = component.element;

    const getComponents = () => {
      const isChevron = Class.has(element, ToolbarButtonClasses.SplitButtonChevron);
      // Harden the sibling lookup: only treat a preceding sibling as the main button if it is
      // actually the split button's main part. This keeps resolution predictable if the DOM
      // structure ever changes (e.g. an extra wrapper), falling back to no main button rather
      // than silently operating on an unrelated sibling.
      const mainOpt = isChevron
        ? Traverse.prevSibling(element)
          .bind((el) => system.getByDom(el).toOptional())
          .filter((comp) => Class.has(comp.element, ToolbarButtonClasses.SplitButtonMain))
        : Optional.some(component);
      const chevronOpt = isChevron
        ? Optional.some(component)
        : Traverse.nextSibling(element).bind((el) => system.getByDom(el).toOptional().filter((comp) => Class.has(comp.element, ToolbarButtonClasses.SplitButtonChevron)));
      return { mainOpt, chevronOpt };
    };

    const applyBoth = (f: (c: AlloyComponent) => void) => {
      const { mainOpt, chevronOpt } = getComponents();
      mainOpt.each(f);
      chevronOpt.each(f);
    };

    return {
      isEnabled: () => {
        const { mainOpt } = getComponents();
        return mainOpt.exists((c) => !Disabling.isDisabled(c));
      },
      setEnabled: (state: boolean) => applyBoth((c) => Disabling.set(c, !state)),
      setText: (text: string) => {
        const { mainOpt } = getComponents();
        mainOpt.each((c) => AlloyTriggers.emitWith(c, updateMenuText, { text }));
      },
      setIcon: (icon: string) => {
        const { mainOpt } = getComponents();
        mainOpt.each((c) => AlloyTriggers.emitWith(c, updateMenuIcon, { icon }));
      },
      setIconFill: (id: string, value: string) => applyBoth((c) => {
        SelectorFind.descendant(c.element, `svg path[class="${id}"], rect[class="${id}"]`).each((underlinePath) => {
          Attribute.set(underlinePath, 'fill', value);
        });
      }),
      isActive: () => {
        const { mainOpt } = getComponents();
        return mainOpt.exists((c) => Toggling.isOn(c));
      },
      setActive: (state: boolean) => {
        const { mainOpt } = getComponents();
        mainOpt.each((c) => Toggling.set(c, state));
      },
      setTooltip: (tooltip: string) => {
        tooltipString.set(tooltip);
        const { mainOpt, chevronOpt } = getComponents();
        mainOpt.each((c) => Attribute.set(c.element, 'aria-label', sharedBackstage.providers.translate(tooltip)));
        // The main button keeps the plain tooltip while the chevron gets the "menu" suffix,
        // so the two adjacent controls don't share an identical accessible name.
        chevronOpt.each((c) => Attribute.set(c.element, 'aria-label', getChevronTooltip(sharedBackstage.providers, tooltip)));
      }
    };
  };

const renderSplitButton = (spec: Toolbar.ToolbarSplitButton, sharedBackstage: UiFactoryBackstageShared, btnName?: string): AlloySpec[] => {
  const editorOffCell = Cell(Fun.noop);
  const tooltipString = Cell<string>(spec.tooltip.getOr(''));
  const getApi = makeSplitButtonApi(tooltipString, sharedBackstage);

  const getMainButtonLabel = (): Optional<string> =>
    spec.tooltip.map((tooltip) => sharedBackstage.providers.translate(tooltip));

  const getChevronLabel = (): Optional<string> =>
    spec.tooltip.map((tooltip) => getChevronTooltip(sharedBackstage.providers, tooltip));

  const structure = renderCommonStructure(spec.icon, spec.text, Optional.none(), Optional.some([
    Toggling.config({
      toggleClass: ToolbarButtonClasses.Ticked,
      // Color split buttons open a palette rather than toggling, so they must not be announced
      // as pressed toggles (this matches TinyMCE 8).
      aria: spec.presets === 'color' ? { mode: 'none' } : { mode: 'pressed' },
      toggleOnExecute: false
    }),
    ...(spec.tooltip.isSome() ? [
      Tooltipping.config(
        sharedBackstage.providers.tooltips.getConfig({
          tooltipText: getMainButtonLabel().getOr(''),
          onShow: (comp) => {
            if (tooltipString.get() !== spec.tooltip.getOr('')) {
              Tooltipping.setComponents(comp,
                sharedBackstage.providers.tooltips.getComponents({ tooltipText: sharedBackstage.providers.translate(tooltipString.get()) })
              );
            }
          }
        })
      )
    ] : [])
  ]), sharedBackstage.providers);

  const mainButton = AlloyButton.sketch({
    dom: {
      ...structure.dom,
      classes: [
        ToolbarButtonClasses.Button,
        ToolbarButtonClasses.SplitButtonMain
      ].concat(spec.text.isSome() ? [ ToolbarButtonClasses.MatchWidth ] : []),
      attributes: {
        ...getMainButtonLabel().map((label) => ({ 'aria-label': label })).getOr({}),
        ...(Type.isNonNullable(btnName) ? { 'data-mce-name': btnName } : {})
      }
    },
    components: structure.components,
    eventOrder: structure.eventOrder,
    buttonBehaviours: structure.buttonBehaviours,
    action: (button) => {
      const api = getApi(button);
      if (api.isEnabled()) {
        spec.onAction(api);
      }
    }
  });

  const arrow = AlloyDropdown.sketch({
    dom: {
      tag: 'button',
      classes: [ ToolbarButtonClasses.Button, ToolbarButtonClasses.SplitButtonChevron ],
      innerHtml: Icons.get('chevron-down', sharedBackstage.providers.icons),
      attributes: {
        ...getChevronLabel().map((label) => ({ 'aria-label': label })).getOr({}),
        ...(Type.isNonNullable(btnName) ? { 'data-mce-name': `${btnName}-chevron` } : {})
      }
    },
    components: [],
    toggleClass: ToolbarButtonClasses.Ticked,
    dropdownBehaviours: Behaviour.derive([
      AddEventsBehaviour.config('split-dropdown-events', [
        AlloyEvents.runOnAttached((comp, _se) => UiUtils.forceInitialSize(comp)),
        onControlAttached({ getApi, onSetup: spec.onSetup }, editorOffCell),
        onControlDetached({ getApi }, editorOffCell)
      ]),
      DisablingConfigs.toolbarButton(sharedBackstage.providers.isDisabled),
      ReadOnly.receivingConfig(),
      Unselecting.config({}),
      Icons.addFocusableBehaviour(),
      ...(spec.tooltip.isSome() ? [
        Tooltipping.config(
          sharedBackstage.providers.tooltips.getConfig({
            tooltipText: getChevronLabel().getOr(''),
            onShow: (comp) => {
              if (tooltipString.get() !== spec.tooltip.getOr('')) {
                Tooltipping.setComponents(comp,
                  sharedBackstage.providers.tooltips.getComponents({ tooltipText: getChevronTooltip(sharedBackstage.providers, tooltipString.get()) })
                );
              }
            }
          })
        )
      ] : [])
    ]),
    eventOrder: {
      [SystemEvents.attachedToDom()]: [ 'alloy.base.behaviour', 'split-dropdown-events', 'add-focusable', 'tooltipping' ],
      [SystemEvents.detachedFromDom()]: [ 'split-dropdown-events', 'tooltipping' ]
    },
    lazySink: sharedBackstage.getSink,
    fetch: fetchChoices(getApi, spec, sharedBackstage.providers),
    // The dropdown anchors to (and highlights) the main button rather than the chevron. Only
    // accept the sibling when it really is the main part; otherwise degrade to anchoring on the
    // chevron itself so the menu still opens in a predictable place.
    getHotspot: (comp) =>
      Traverse.prevSibling(comp.element)
        .bind((el) => comp.getSystem().getByDom(el).toOptional())
        .filter((main) => Class.has(main.element, ToolbarButtonClasses.SplitButtonMain))
        .orThunk(() => Optional.some(comp)),
    onOpen: (_anchor, _comp, menu) => {
      Highlighting.highlightBy(menu, (item) => Class.has(item.element, 'tox-collection__item--active'));
      Highlighting.getHighlighted(menu).each(Keying.focusIn);
    },
    parts: {
      // FIX: hasIcons
      menu: MenuParts.part(false, spec.columns, spec.presets)
    }
  });

  return [ mainButton, arrow ];
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
