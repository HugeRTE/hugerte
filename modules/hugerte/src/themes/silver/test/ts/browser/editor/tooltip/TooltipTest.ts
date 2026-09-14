import { Waiter } from '@ephox/agar';
import { context, describe, it } from '@ephox/bedrock-client';
import { Toolbar } from '@ephox/bridge';
import { Arr, Fun } from '@ephox/katamari';
import { PlatformDetection } from '@ephox/sand';
import { Attribute, SugarElement, TextContent } from '@ephox/sugar';
import { TinyHooks, TinyUiActions } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'hugerte/core/api/Editor';
import EditorManager from 'hugerte/core/api/EditorManager';

import * as TooltipUtils from '../../../module/TooltipUtils';

interface TestScenario {
  readonly label: string;
  readonly pTriggerTooltip: (editor: Editor, selector: string) => Promise<void>;
}

describe('browser.hugerte.themes.silver.editor.TooltipTest', () => {

  Arr.each([
    { label: 'Mouse', pTriggerTooltip: TooltipUtils.pTriggerTooltipWithMouse },
    { label: 'Keyboard', pTriggerTooltip: TooltipUtils.pTriggerTooltipWithKeyboard },
  ], (test: TestScenario) => {
    context('Basic buttons', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'basic-button toggle-button menu-button split-button forecolor split-button-with-icon',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('basic-button', {
            text: 'Button',
            tooltip: 'Button',
            onAction: Fun.noop
          });

          ed.ui.registry.addToggleButton('toggle-button', {
            text: 'Toggle Button',
            tooltip: 'Toggle Button',
            onAction: Fun.noop
          });

          ed.ui.registry.addMenuButton('menu-button', {
            text: 'Menu Button',
            tooltip: 'Menu Button',
            fetch: (success) => {
              success([
                {
                  type: 'togglemenuitem',
                  text: 'Toggle menu item',
                  onAction: Fun.noop,
                  active: true
                }
              ]);
            },
          });

          ed.ui.registry.addSplitButton('split-button', {
            text: 'Split Button',
            tooltip: 'Split Button',
            fetch: (success) => {
              success([
                {
                  text: 'Choice item 1',
                  type: 'choiceitem',
                }
              ]);
            },
            onAction: Fun.noop,
            onItemAction: Fun.noop
          });

          ed.ui.registry.addSplitButton('split-button-with-icon', {
            icon: 'bold',
            tooltip: 'Split Button with Icon',
            presets: 'listpreview',
            columns: 3,
            fetch: (success) => {
              success([
                {
                  type: 'choiceitem',
                  value: 'lower-alpha-1',
                  icon: 'list-num-lower-alpha',
                  text: 'Lower Alpha 1'
                },
                {
                  type: 'choiceitem',
                  value: 'lower-alpha-2',
                  icon: 'list-num-lower-alpha',
                  text: 'Lower Alpha 2'
                },
                {
                  type: 'choiceitem',
                  value: 'lower-alpha-3',
                  icon: 'list-num-lower-alpha',
                  text: 'Lower Alpha 3'
                }
              ]);
            },
            onAction: Fun.noop,
            onItemAction: Fun.noop,
            select: Fun.always,
            onSetup: () => Fun.noop
          });
        }
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar addButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="basic-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Button');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar addToggleButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="toggle-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Toggle Button');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar addMenuButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="menu-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Menu Button');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar addSplitButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'div[data-mce-name="split-button"] .tox-split-button__main';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Split Button');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar Split Button Menu - forecolor`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'div[data-mce-name="forecolor"] > .tox-tbtn + .tox-split-button__chevron';
        await TooltipUtils.pOpenMenu(editor, buttonSelector);
        await Waiter.pWait(300);
        const menuSelector = 'div[data-mce-name="Red"]';
        await test.pTriggerTooltip(editor, menuSelector);
        const tooltip = await TinyUiActions.pWaitForUi(editor, '.tox-silver-sink .tox-tooltip__body:contains("Red")') as SugarElement<HTMLElement>;
        assert.equal(TextContent.get(tooltip), 'Red');
        await TooltipUtils.pCloseTooltip(editor, menuSelector);
        await TooltipUtils.pCloseMenu(menuSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - Toolbar Split Button Menu - listpreview`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'div[data-mce-name="split-button-with-icon"]  > .tox-tbtn + .tox-split-button__chevron';
        await TooltipUtils.pOpenMenu(editor, buttonSelector);
        const menuSelector = 'div[aria-label="Lower Alpha 1"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, menuSelector), 'Lower Alpha 1');
        await TooltipUtils.pCloseTooltip(editor, menuSelector);
        await TooltipUtils.pCloseMenu(menuSelector);
      });
    });

    context('setTooltip API', () => {
      let buttonApi: Toolbar.ToolbarButtonInstanceApi | undefined;
      let toggleButtonApi: Toolbar.ToolbarToggleButtonInstanceApi | undefined;
      let menuButtonApi: Toolbar.ToolbarMenuButtonInstanceApi | undefined;
      let noTooltipButtonApi: Toolbar.ToolbarButtonInstanceApi | undefined;
      let persistButtonApi: Toolbar.ToolbarButtonInstanceApi | undefined;

      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'set-tooltip-button set-tooltip-toggle-button set-tooltip-menu-button set-tooltip-no-tooltip-button set-tooltip-persist-button',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('set-tooltip-button', {
            text: 'Button',
            tooltip: 'Initial Button Tooltip',
            onSetup: (api) => {
              buttonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });

          ed.ui.registry.addButton('set-tooltip-no-tooltip-button', {
            text: 'No Tooltip Button',
            onSetup: (api) => {
              noTooltipButtonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });

          ed.ui.registry.addButton('set-tooltip-persist-button', {
            text: 'Persist Button',
            tooltip: 'Persist Initial Tooltip',
            onSetup: (api) => {
              persistButtonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });

          ed.ui.registry.addToggleButton('set-tooltip-toggle-button', {
            text: 'Toggle Button',
            tooltip: 'Initial Toggle Tooltip',
            onSetup: (api) => {
              toggleButtonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });

          ed.ui.registry.addMenuButton('set-tooltip-menu-button', {
            text: 'Menu Button',
            tooltip: 'Initial Menu Tooltip',
            onSetup: (api) => {
              menuButtonApi = api;
              return Fun.noop;
            },
            fetch: (success) => {
              success([
                {
                  type: 'togglemenuitem',
                  text: 'Toggle menu item',
                  onAction: Fun.noop
                }
              ]);
            },
          });
        }
      });

      it(`GH-205: setTooltip should update the aria-label and tooltip with ${test.label} - Toolbar addButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-button"]';
        assert.isOk(buttonApi);
        buttonApi?.setTooltip('Updated Button Tooltip');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Updated Button Tooltip');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Updated Button Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip should update the aria-label and tooltip with ${test.label} - Toolbar addToggleButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-toggle-button"]';
        assert.isOk(toggleButtonApi);
        toggleButtonApi?.setTooltip('Updated Toggle Tooltip');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Updated Toggle Tooltip');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Updated Toggle Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip should update the aria-label and tooltip with ${test.label} - Toolbar addMenuButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-menu-button"]';
        assert.isOk(menuButtonApi);
        menuButtonApi?.setTooltip('Updated Menu Tooltip');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Updated Menu Tooltip');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Updated Menu Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip should not throw and update the aria-label on a button with no initial tooltip with ${test.label}`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-no-tooltip-button"]';
        assert.isOk(noTooltipButtonApi);
        noTooltipButtonApi?.setTooltip('Updated No Tooltip');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Updated No Tooltip');
        await TooltipUtils.pAssertNoTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), '');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip should persist across tooltip re-shows with ${test.label} - Toolbar addButton`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-persist-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Persist Initial Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        assert.isOk(persistButtonApi);
        persistButtonApi?.setTooltip('Persist Updated Tooltip');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Persist Updated Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('setTooltip with shortcut', () => {
      let buttonApi: Toolbar.ToolbarButtonInstanceApi | undefined;
      let sameStringButtonApi: Toolbar.ToolbarButtonInstanceApi | undefined;
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'set-tooltip-shortcut-button set-tooltip-shortcut-same-string-button',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('set-tooltip-shortcut-button', {
            text: 'Bold',
            tooltip: 'Bold',
            shortcut: 'Meta+B',
            onSetup: (api) => {
              buttonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });

          ed.ui.registry.addButton('set-tooltip-shortcut-same-string-button', {
            text: 'Bold',
            tooltip: 'Bold',
            shortcut: 'Meta+B',
            onSetup: (api) => {
              sameStringButtonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });
        }
      });
      const os = PlatformDetection.detect().os;
      const meta = os.isMacOS() || os.isiOS() ? '\u2318' : 'Ctrl+';

      it(`GH-205: Initial tooltip should include the shortcut suffix with ${test.label}`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-shortcut-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), `Bold (${meta}B)`);
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip should drop the shortcut suffix from the hover tooltip with ${test.label}`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-shortcut-button"]';
        assert.isOk(buttonApi);
        buttonApi?.setTooltip('Updated Bold Tooltip');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Updated Bold Tooltip');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Updated Bold Tooltip');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`GH-205: setTooltip with the same string as the initial tooltip should drop the shortcut suffix with ${test.label}`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-shortcut-same-string-button"]';
        // Sanity check: the initial tooltip includes the shortcut suffix.
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), `Bold (${meta}B)`);
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        assert.isOk(sameStringButtonApi);
        sameStringButtonApi?.setTooltip('Bold');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'Bold');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Bold');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('setTooltip translation', () => {
      let buttonApi: Toolbar.ToolbarButtonInstanceApi | undefined;
      // Register a test language pack up front so the editor picks it up without loading a file.
      EditorManager.addI18n('xx', {
        'set-tooltip-raw': 'set-tooltip-translated',
        'set-tooltip-translated': 'set-tooltip-translated-again'
      });
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'set-tooltip-translate-button',
        language: 'xx',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('set-tooltip-translate-button', {
            text: 'Translate Button',
            tooltip: 'Start',
            onSetup: (api) => {
              buttonApi = api;
              return Fun.noop;
            },
            onAction: Fun.noop
          });
        }
      });

      it(`GH-205: setTooltip should translate the raw tooltip for the aria-label and hover tooltip without double translation with ${test.label}`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="set-tooltip-translate-button"]';
        assert.isOk(buttonApi);
        buttonApi?.setTooltip('set-tooltip-raw');
        const button = await TinyUiActions.pWaitForUi(editor, buttonSelector) as SugarElement<HTMLElement>;
        assert.equal(Attribute.get(button, 'aria-label'), 'set-tooltip-translated');
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'set-tooltip-translated');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('Dialog related buttons', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'dialog-button dialog-footer-button size-input-dialog-button',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('dialog-button', {
            text: 'Dialog Button',
            onAction: () => {
              ed.windowManager.open({
                title: 'Test Dialog',
                size: 'normal',
                body: {
                  type: 'panel',
                  items: [{
                    type: 'button',
                    name: 'prev',
                    text: 'Test-Button',
                    icon: 'action-prev',
                  }]
                }
              });
            }
          });

          ed.ui.registry.addButton('dialog-footer-button', {
            text: 'Dialog Footer Button',
            onAction: () => {
              ed.windowManager.open({
                title: 'Test Dialog',
                size: 'normal',
                body: {
                  type: 'panel',
                  items: [
                    {
                      type: 'input',
                      name: 'width',
                      label: 'Width'
                    },
                  ]
                },
                buttons: [
                  {
                    type: 'menu',
                    name: 'options',
                    icon: 'Preferences',
                    tooltip: 'Preferences',
                    align: 'start',
                    items: [{
                      type: 'togglemenuitem',
                      name: 'menuitem1',
                      text: 'Menu item 1',
                    }]
                  },
                  {
                    type: 'togglebutton',
                    text: 'notooltip',
                    align: 'start',
                  },
                ]
              });
            }
          });

          ed.ui.registry.addButton('size-input-dialog-button', {
            text: 'Dialog Button',
            onAction: () => {
              ed.windowManager.open({
                title: 'Test Dialog',
                size: 'normal',
                body: {
                  type: 'panel',
                  items: [
                    {
                      type: 'sizeinput',
                      name: 'dimensions',
                      label: 'Constrain proportions',
                      constrain: true
                    }
                  ]
                }
              });
            }
          });
        }
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - button without label in Dialog`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="dialog-button"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForDialog(editor);
        const buttonSelector = '[data-mce-name="Test-Button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Test-Button');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        TinyUiActions.closeDialog(editor);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - sizeinput - 'Constrain Proportions' in Dialog`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="size-input-dialog-button"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForDialog(editor);
        const buttonSelector = '[data-mce-name="Constrain proportions"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Constrain proportions');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        TinyUiActions.closeDialog(editor);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - dialog footer button`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="dialog-footer-button"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForDialog(editor);
        const buttonSelector = '[data-mce-name="Preferences"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Preferences');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        TinyUiActions.closeDialog(editor);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - dialog close button`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="dialog-footer-button"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForDialog(editor);
        const buttonSelector = '[data-mce-name="close"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Close');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        TinyUiActions.closeDialog(editor);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - dialog footer button - togglebutton`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="dialog-footer-button"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForDialog(editor);
        const buttonSelector = '[data-mce-name="notooltip"]';
        await TooltipUtils.pAssertNoTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), '');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        TinyUiActions.closeDialog(editor);
      });
    });

    context('Bespoke buttons', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'fontsizeinput fontsize fontfamily align styles blocks',
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - fontsizeinput - Decrease font size`, async () => {
        const editor = hook.editor();
        const buttonSelector = '[data-mce-name="fontsizeinput"] > [data-mce-name="minus"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Decrease font size');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - fontsizeinput - Increase font size`, async () => {
        const editor = hook.editor();
        const buttonSelector = '[data-mce-name="fontsizeinput"] > [data-mce-name="plus"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Increase font size');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - fontsize`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="fontsize"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Font size 12pt');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - fontfamily`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="fontfamily"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Font System Font');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - align`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="align"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Alignment left');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - blocks`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="blocks"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Block Paragraph');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - styles`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="styles"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Format Paragraph');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('Resize handle', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        resize: 'both'
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - resize handle`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'div[data-mce-name="resize-handle"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Resize');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('overflow-button', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        toolbar: Arr.range(25, Fun.constant('bold | italic | test-button')).join(' '),
        toolbar_mode: 'floating',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('test-button', {
            text: 'Test Button for Overflow Button',
            onAction: Fun.noop
          });
        },
        base_url: '/project/hugerte/js/hugerte'
      });

      it(`TINY-10453: Should trigger tooltip with ${test.label} - overflow more button`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'button[data-mce-name="overflow-button"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Reveal or hide additional toolbar items');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
      });
    });

    context('No tooltip', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        toolbar: 'split-button',
        toolbar_mode: 'floating',
        setup: (ed: Editor) => {
          ed.ui.registry.addSplitButton('split-button', {
            text: 'Split Button',
            tooltip: 'Split Button',
            fetch: (success) => {
              success([
                {
                  text: 'Choice item 1',
                  type: 'choiceitem',
                }
              ]);
            },
            onAction: Fun.noop,
            onItemAction: Fun.noop
          });
        },
        base_url: '/project/hugerte/js/hugerte'
      });

      it(`TINY-10453: Should not show tooltip with ${test.label} - Contains text and no icon`, async () => {
        const editor = hook.editor();
        const buttonSelector = 'div[data-mce-name="split-button"] > .tox-tbtn + .tox-split-button__chevron';
        await TooltipUtils.pOpenMenu(editor, buttonSelector);
        const menuSelector = '[aria-label="Choice item 1"]';
        await TooltipUtils.pAssertNoTooltip(editor, () => test.pTriggerTooltip(editor, menuSelector), '');
        await TooltipUtils.pCloseMenu(menuSelector);
      });
    });

    context('View', () => {
      const hook = TinyHooks.bddSetup<Editor>({
        base_url: '/project/hugerte/js/hugerte',
        toolbar: 'test-view',
        setup: (ed: Editor) => {
          ed.ui.registry.addButton('test-view', {
            text: 'Test View',
            onAction: () => {
              ed.execCommand('ToggleView', false, 'view');
            }
          });
          ed.ui.registry.addView('view', {
            buttons: [
              {
                type: 'group',
                buttons: [
                  {
                    type: 'togglebutton' as const,
                    icon: 'fullscreen',
                    tooltip: 'Fullscreen',
                    onAction: Fun.noop
                  },
                  {
                    type: 'togglebutton',
                    icon: 'copy',
                    text: 'Copy code',
                    onAction: Fun.noop
                  },
                  {
                    type: 'togglebutton',
                    text: 'Copy code 2',
                    onAction: Fun.noop
                  },
                  {
                    type: 'togglebutton',
                    icon: 'Bold',
                    tooltip: 'Bold',
                    onAction: Fun.noop
                  },
                ]
              }
            ],
            onShow: Fun.noop,
            onHide: Fun.noop
          });
        }
      });

      it(`TINY-10672: Should trigger tooltip with ${test.label} - View togglebutton - with tooltip and icon, no text`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="test-view"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForUi(editor, '.tox-view-wrap');
        const buttonSelector = 'button[aria-label="Fullscreen"]';
        await TooltipUtils.pAssertTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), 'Fullscreen');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        editor.execCommand('ToggleView', false, 'view');
      });

      it(`TINY-10672: Should not trigger tooltip with ${test.label} - View togglebutton - with text and icon, no tooltip`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="test-view"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForUi(editor, '.tox-view-wrap');
        const buttonSelector = 'button[aria-label="Copy code"]';
        await TooltipUtils.pAssertNoTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), '');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        editor.execCommand('ToggleView', false, 'view');
      });

      it(`TINY-10672: Should not trigger tooltip with ${test.label} - View togglebutton - with text, no icon and tooltip`, async () => {
        const editor = hook.editor();
        const toolbarButtonSelector = '[data-mce-name="test-view"]';
        TinyUiActions.clickOnToolbar(editor, toolbarButtonSelector);
        await TinyUiActions.pWaitForUi(editor, '.tox-view-wrap');
        const buttonSelector = 'button[aria-label="Copy code 2"]';
        await TooltipUtils.pAssertNoTooltip(editor, () => test.pTriggerTooltip(editor, buttonSelector), '');
        await TooltipUtils.pCloseTooltip(editor, buttonSelector);
        editor.execCommand('ToggleView', false, 'view');
      });
    });
  });
});
